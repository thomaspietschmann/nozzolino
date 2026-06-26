package app.notes.mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.ConcurrentHashMap

/**
 * Native Capacitor plugin exposing the 9-method VaultFS interface over Android SAF
 * (Storage Access Framework), plus lifecycle helpers for folder picking and URI persistence.
 *
 * All paths are vault-relative POSIX strings (forward slashes, no leading slash).
 * Document IDs are resolved and cached to avoid repeated SAF round-trips.
 */
@CapacitorPlugin(name = "VaultPlugin")
class VaultPlugin : Plugin() {

    companion object {
        private const val PREFS_NAME = "vault"
        private const val PREF_KEY = "vault_tree_uri"
        private const val MIME_DIR = DocumentsContract.Document.MIME_TYPE_DIR

        /** Projection used for directory listing (keeps cursor slim). */
        private val LIST_PROJ = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        )
    }

    /** Active SAF tree URI (set by pickFolder or setRoot). */
    private var treeUri: Uri? = null

    /**
     * Maps vault-relative POSIX path → SAF document ID.
     * Populated by listDirectory and updated on create/rename/delete.
     */
    private val docIdCache = ConcurrentHashMap<String, String>()

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    /** Launch the SAF folder picker. Persists the chosen URI on success. */
    @PluginMethod
    fun pickFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            )
        }
        startActivityForResult(call, intent, "pickFolderResult")
    }

    @ActivityCallback
    @Suppress("unused")
    private fun pickFolderResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("Folder picker cancelled")
            return
        }
        val uri = result.data?.data ?: run { call.reject("No URI returned"); return }
        context.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
        persistUri(uri)
        applyTreeUri(uri)
        call.resolve(JSObject().put("uri", uri.toString()))
    }

    /** Return the saved vault URI (SharedPreferences), or null if none / permission revoked. */
    @PluginMethod
    fun getSavedFolder(call: PluginCall) {
        val uriStr = context.getSharedPreferences(PREFS_NAME, 0).getString(PREF_KEY, null)
        if (uriStr == null) {
            call.resolve(JSObject().put("uri", JSObject.NULL))
            return
        }
        val uri = Uri.parse(uriStr)
        val stillHeld = context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
        call.resolve(JSObject().put("uri", if (stillHeld) uriStr else JSObject.NULL))
    }

    /** Activate a vault URI (previously returned by getSavedFolder) without re-persisting. */
    @PluginMethod
    fun setRoot(call: PluginCall) {
        val uriStr = call.getString("uri") ?: run { call.reject("uri required"); return }
        applyTreeUri(Uri.parse(uriStr))
        call.resolve()
    }

    // ── VaultFS methods ───────────────────────────────────────────────────────

    @PluginMethod
    fun readFile(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            val docId = resolveDocId(path) ?: run { call.reject("ENOENT: $path"); return }
            val content = context.contentResolver
                .openInputStream(docUri(docId))
                ?.use { it.readBytes().toString(Charsets.UTF_8) }
                ?: run { call.reject("ENOENT: $path"); return }
            call.resolve(JSObject().put("content", content))
        } catch (e: Exception) {
            call.reject("readFile failed: ${e.message}")
        }
    }

    @PluginMethod
    fun writeFile(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        val content = call.getString("content") ?: run { call.reject("content required"); return }
        try {
            writeText(path, content)
            call.resolve()
        } catch (e: Exception) {
            call.reject("writeFile failed: ${e.message}")
        }
    }

    /**
     * Rename/move a document within the same parent directory.
     * If the target already exists it is deleted first (SAF renameDocument cannot overwrite).
     * This matches atomicWrite's tmp→final rename pattern used by vaultOps.
     */
    @PluginMethod
    fun renameFile(call: PluginCall) {
        val from = call.getString("from") ?: run { call.reject("from required"); return }
        val to   = call.getString("to")   ?: run { call.reject("to required"); return }
        try {
            val fromDocId = resolveDocId(from) ?: run { call.reject("ENOENT: $from"); return }
            // Delete existing target (SAF cannot overwrite on rename)
            resolveDocId(to)?.let { existingId ->
                DocumentsContract.deleteDocument(context.contentResolver, docUri(existingId))
                docIdCache.remove(to)
            }
            val newUri = DocumentsContract.renameDocument(
                context.contentResolver,
                docUri(fromDocId),
                basename(to)
            ) ?: run { call.reject("renameDocument returned null for $from"); return }
            val newDocId = DocumentsContract.getDocumentId(newUri)
            docIdCache.remove(from)
            docIdCache[to] = newDocId
            call.resolve()
        } catch (e: Exception) {
            call.reject("renameFile failed: ${e.message}")
        }
    }

    @PluginMethod
    fun deleteFile(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            val docId = resolveDocId(path)
            if (docId != null) {
                DocumentsContract.deleteDocument(context.contentResolver, docUri(docId))
                docIdCache.remove(path)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("deleteFile failed: ${e.message}")
        }
    }

    /**
     * List one level of a directory. Populates the docId cache for all children,
     * which makes subsequent readFile calls O(1) in the cache.
     */
    @PluginMethod
    fun listDirectory(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            val parentDocId = if (path.isEmpty() || path == ".") {
                rootDocId()
            } else {
                resolveDocId(path) ?: run { call.reject("ENOENT: $path"); return }
            }
            val entries = JSArray()
            val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, parentDocId)
            context.contentResolver.query(childUri, LIST_PROJ, null, null, null)?.use { cursor ->
                val idIdx   = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val childDocId = cursor.getString(idIdx)
                    val name       = cursor.getString(nameIdx) ?: continue
                    val mime       = cursor.getString(mimeIdx)
                    val isDir      = mime == MIME_DIR
                    val childPath  = if (path.isEmpty() || path == ".") name else "$path/$name"
                    docIdCache[childPath] = childDocId
                    val entry = JSObject()
                        .put("name", name)
                        .put("path", childPath)
                        .put("isDirectory", isDir)
                    entries.put(entry)
                }
            }
            call.resolve(JSObject().put("entries", entries))
        } catch (e: Exception) {
            call.reject("listDirectory failed: ${e.message}")
        }
    }

    @PluginMethod
    fun exists(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        call.resolve(JSObject().put("exists", resolveDocId(path) != null))
    }

    @PluginMethod
    fun mkdir(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            ensureDir(path)
            call.resolve()
        } catch (e: Exception) {
            call.reject("mkdir failed: ${e.message}")
        }
    }

    @PluginMethod
    fun stat(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            val docId = resolveDocId(path) ?: run { call.reject("ENOENT: $path"); return }
            val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri!!, docId)
            val proj = arrayOf(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            var mtime = 0L
            context.contentResolver.query(uri, proj, null, null, null)?.use { c ->
                if (c.moveToFirst()) mtime = c.getLong(0)
            }
            call.resolve(JSObject().put("mtime", mtime))
        } catch (e: Exception) {
            call.reject("stat failed: ${e.message}")
        }
    }

    @PluginMethod
    fun writeBinaryFile(call: PluginCall) {
        val path   = call.getString("path")   ?: run { call.reject("path required");   return }
        val base64 = call.getString("base64") ?: run { call.reject("base64 required"); return }
        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            writeBytes(path, bytes)
            call.resolve()
        } catch (e: Exception) {
            call.reject("writeBinaryFile failed: ${e.message}")
        }
    }

    @PluginMethod
    fun readBinaryFile(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        try {
            val docId = resolveDocId(path) ?: run { call.reject("ENOENT: $path"); return }
            val bytes = context.contentResolver
                .openInputStream(docUri(docId))
                ?.use { it.readBytes() }
                ?: run { call.reject("ENOENT: $path"); return }
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            call.resolve(JSObject().put("base64", base64))
        } catch (e: Exception) {
            call.reject("readBinaryFile failed: ${e.message}")
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun rootDocId(): String = DocumentsContract.getTreeDocumentId(treeUri!!)

    private fun docUri(docId: String): Uri =
        DocumentsContract.buildDocumentUriUsingTree(treeUri!!, docId)

    private fun applyTreeUri(uri: Uri) {
        treeUri = uri
        docIdCache.clear()
        docIdCache[""] = DocumentsContract.getTreeDocumentId(uri)
        docIdCache["."] = DocumentsContract.getTreeDocumentId(uri)
    }

    private fun persistUri(uri: Uri) {
        context.getSharedPreferences(PREFS_NAME, 0).edit()
            .putString(PREF_KEY, uri.toString())
            .apply()
    }

    /**
     * Resolve a vault-relative path to its SAF document ID.
     * Returns null if the document does not exist.
     * Walks from the cached root when the direct cache lookup misses.
     */
    private fun resolveDocId(relPath: String): String? {
        if (relPath.isEmpty() || relPath == ".") return rootDocId()
        docIdCache[relPath]?.let { return it }

        val segments = relPath.split("/")
        var current = rootDocId()

        for ((i, seg) in segments.withIndex()) {
            val pathSoFar = segments.subList(0, i + 1).joinToString("/")
            val cached = docIdCache[pathSoFar]
            if (cached != null) { current = cached; continue } // already cached

            val parentPath = if (i == 0) "" else segments.subList(0, i).joinToString("/")
            val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, current)
            var found: String? = null
            context.contentResolver.query(
                childUri,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME
                ),
                null, null, null
            )?.use { cursor ->
                val idIdx   = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val childName = cursor.getString(nameIdx) ?: continue
                    val childId   = cursor.getString(idIdx)
                    val childPath = if (parentPath.isEmpty()) childName else "$parentPath/$childName"
                    docIdCache[childPath] = childId
                    if (childName == seg) found = childId
                }
            }
            if (found == null) return null
            current = found!!
        }
        return current
    }

    /**
     * Ensure a directory (and all parents) exists in the SAF tree.
     * Returns the document ID of the leaf directory.
     */
    private fun ensureDir(relPath: String): String {
        if (relPath.isEmpty() || relPath == ".") return rootDocId()
        docIdCache[relPath]?.let { return it }

        val slashIdx = relPath.lastIndexOf('/')
        val parentPath = if (slashIdx < 0) "" else relPath.substring(0, slashIdx)
        val dirName    = relPath.substring(slashIdx + 1)
        val parentDocId = ensureDir(parentPath)

        // Check if the dir already exists under the parent
        val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, parentDocId)
        context.contentResolver.query(
            childUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            ),
            null, null, null
        )?.use { cursor ->
            val idIdx   = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            while (cursor.moveToNext()) {
                if (cursor.getString(nameIdx) == dirName && cursor.getString(mimeIdx) == MIME_DIR) {
                    val docId = cursor.getString(idIdx)
                    docIdCache[relPath] = docId
                    return docId
                }
            }
        }

        // Create the directory
        val newUri = DocumentsContract.createDocument(
            context.contentResolver, docUri(parentDocId), MIME_DIR, dirName
        ) ?: throw Exception("Failed to create directory: $relPath")
        val newDocId = DocumentsContract.getDocumentId(newUri)
        docIdCache[relPath] = newDocId
        return newDocId
    }

    private fun writeText(path: String, content: String) {
        val docId = getOrCreateDocId(path, "text/plain")
        context.contentResolver.openOutputStream(docUri(docId), "wt")?.use { out ->
            out.write(content.toByteArray(Charsets.UTF_8))
        } ?: throw Exception("Cannot open output stream for: $path")
    }

    private fun writeBytes(path: String, bytes: ByteArray) {
        val docId = getOrCreateDocId(path, "application/octet-stream")
        context.contentResolver.openOutputStream(docUri(docId), "wt")?.use { out ->
            out.write(bytes)
        } ?: throw Exception("Cannot open output stream for: $path")
    }

    /** Return the existing docId for `path`, creating the file (and parent dirs) if needed. */
    private fun getOrCreateDocId(path: String, mimeType: String): String {
        resolveDocId(path)?.let { return it }
        val slashIdx = path.lastIndexOf('/')
        val parentPath = if (slashIdx < 0) "" else path.substring(0, slashIdx)
        val name       = path.substring(slashIdx + 1)
        val parentDocId = ensureDir(parentPath)
        val newUri = DocumentsContract.createDocument(
            context.contentResolver, docUri(parentDocId), mimeType, name
        ) ?: throw Exception("Failed to create file: $path")
        val docId = DocumentsContract.getDocumentId(newUri)
        docIdCache[path] = docId
        return docId
    }

    private fun basename(path: String): String = path.substringAfterLast('/')
}

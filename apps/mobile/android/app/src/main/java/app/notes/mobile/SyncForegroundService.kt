package app.notes.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.provider.DocumentsContract
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Foreground service that runs server-mode sync natively (OkHttp + SAF) while the
 * WebView is dead. This is the background counterpart to the JS SyncEngine, which
 * still owns the foreground path.
 *
 * Config is read from SharedPreferences (written by [SyncPlugin.setConfig], which
 * the JS bridge forwards on `sync:setConfig` and vault open). The vault is the SAF
 * tree URI persisted by [VaultPlugin]; sync state (per-path ETags) is persisted in
 * this service's own SharedPreferences as a JSON map.
 *
 * Reconciliation is deliberately simple (ETag compare, last-writer pull/push) — the
 * full three-way logic lives in the JS engine. A pass that fails (offline, revoked
 * permission, server error) is skipped; the next tick retries.
 */
class SyncForegroundService : Service() {

    companion object {
        private const val TAG = "SyncFgService"

        private const val CHANNEL_ID = "notes_sync"
        private const val NOTIFICATION_ID = 0x5C

        private const val SYNC_INTERVAL_MS = 15L * 60L * 1000L // ~15 min

        // Config prefs (written by SyncPlugin.setConfig)
        const val CONFIG_PREFS = "sync_config"
        const val KEY_URL = "server_url"
        const val KEY_TOKEN = "token"
        const val KEY_MODE = "mode"
        const val KEY_VAULT_URI = "vault_uri"

        // Native sync state prefs (owned by this service)
        private const val STATE_PREFS = "sync_state"
        private const val KEY_ETAGS = "etag_map"

        private val MIME_DIR = DocumentsContract.Document.MIME_TYPE_DIR

        fun start(context: Context) {
            val intent = Intent(context, SyncForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SyncForegroundService::class.java))
        }
    }

    /** Dedicated worker thread so SAF + OkHttp never touch the main looper. */
    private var workerThread: HandlerThread? = null
    private var workerHandler: Handler? = null
    @Volatile private var running = false

    private val syncRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            try {
                runSyncPass()
            } catch (e: Exception) {
                Log.w(TAG, "sync pass failed: ${e.message}")
            }
            if (running) workerHandler?.postDelayed(this, SYNC_INTERVAL_MS)
        }
    }

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /** Active SAF tree URI for the current pass. */
    private var treeUri: Uri? = null
    /** vault-relative POSIX path → SAF document ID (rebuilt each pass). */
    private val docIdCache = HashMap<String, String>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // On API 34+, promoting a dataSync FGS can throw
        // ForegroundServiceStartNotAllowedException (e.g. if the process is no longer
        // in an allowed state). The supported way to avoid the "start from background"
        // restriction is to start the service from the foreground→background
        // transition (see bridge.ts appStateChange), but we still fail gracefully
        // here rather than crash if the platform rejects the promotion.
        try {
            startForegroundCompat()
            if (workerThread == null) {
                running = true
                val thread = HandlerThread("notes-sync").also { it.start() }
                workerThread = thread
                val handler = Handler(thread.looper)
                workerHandler = handler
                // First pass immediately, then every ~15 min (re-posted by the runnable).
                handler.post(syncRunnable)
            }
        } catch (e: Exception) {
            // Covers ForegroundServiceStartNotAllowedException (API 31+) and any
            // other failure promoting/continuing the service. Stop quietly.
            Log.w(TAG, "could not start foreground service: ${e.message}")
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        workerHandler?.removeCallbacksAndMessages(null)
        workerThread?.quitSafely()
        workerThread = null
        workerHandler = null
        super.onDestroy()
    }

    // ── Notification (required for FGS) ──────────────────────────────────────────

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background sync",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Keeps your notes in sync with the server"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Notes")
            .setContentText("Syncing in the background")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build()

    private fun startForegroundCompat() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // ── Sync pass ────────────────────────────────────────────────────────────────

    private fun runSyncPass() {
        val prefs = getSharedPreferences(CONFIG_PREFS, 0)
        val mode = prefs.getString(KEY_MODE, null)
        if (mode != "server") {
            Log.d(TAG, "mode != server ($mode); skipping pass")
            return
        }
        val baseUrl = prefs.getString(KEY_URL, null)?.trimEnd('/') ?: return
        val token = prefs.getString(KEY_TOKEN, null) ?: return
        val vaultUriStr = prefs.getString(KEY_VAULT_URI, null) ?: return

        // Still hold the SAF permission?
        val vault = Uri.parse(vaultUriStr)
        val held = contentResolver.persistedUriPermissions.any {
            it.uri == vault && it.isReadPermission && it.isWritePermission
        }
        if (!held) {
            Log.w(TAG, "SAF permission not held for $vault; skipping pass")
            return
        }
        applyTreeUri(vault)

        val etags = loadEtags()

        val serverFiles = listServerFiles(baseUrl, token) ?: return
        val serverPaths = HashSet<String>()
        // path → current server etag, used in the push loop to avoid clobbering
        // server-side edits with a null If-Match (an unconditional overwrite).
        val serverEtagByPath = HashMap<String, String>()
        for (entry in serverFiles) serverEtagByPath[entry.path] = entry.etag

        // ── Pull: server files that are new or changed relative to our etag map ──
        for (entry in serverFiles) {
            val path = entry.path
            serverPaths.add(path)
            val serverEtag = entry.etag
            val knownEtag = etags[path]
            if (knownEtag == serverEtag) continue // already up to date

            // Compare with the local file's actual content hash. If the local file
            // already matches the server, just record the etag (no write needed).
            val localBytes = readLocal(path)
            val localEtag = localBytes?.let { etagOf(it) }
            if (localEtag == serverEtag) {
                etags[path] = serverEtag
                continue
            }

            // If local is newer than what we last acknowledged (knownEtag) AND differs
            // from the server, this is a genuine divergence — defer to the JS engine's
            // conflict handling by leaving it for foreground sync. Otherwise pull.
            if (localEtag != null && knownEtag != null && localEtag != knownEtag) {
                Log.d(TAG, "divergence on $path; deferring to foreground engine")
                continue
            }

            val pulled = getServerFile(baseUrl, token, path) ?: continue
            try {
                writeLocal(path, pulled.first)
                etags[path] = pulled.second
                Log.d(TAG, "pulled $path")
            } catch (e: Exception) {
                Log.w(TAG, "write failed for $path: ${e.message}")
            }
        }

        // ── Push: local files newer than the server (or not on server yet) ──
        for (path in listLocalSyncPaths()) {
            val bytes = readLocal(path) ?: continue
            val localEtag = etagOf(bytes)
            val knownEtag = etags[path]
            if (knownEtag == localEtag) continue // server already has this content

            // Decide the If-Match precondition. NEVER PUT with a null If-Match for a
            // path the server already has — a null precondition is an unconditional
            // overwrite (the server only runs its 409 check when If-Match is present),
            // which would silently clobber a newer server edit.
            val serverEtag = serverEtagByPath[path]
            val ifMatch: String?
            if (serverEtag != null) {
                // Server already has this path.
                if (knownEtag != null && knownEtag != serverEtag) {
                    // Server changed since we last acked it AND local also differs —
                    // genuine divergence. Defer to the foreground engine's conflict
                    // handling rather than overwriting either side.
                    Log.d(TAG, "divergence on $path; deferring push to foreground engine")
                    continue
                }
                // Guard the PUT with the current server etag; a 409 means a real
                // concurrent change we then skip (handled in putServerFile).
                ifMatch = serverEtag
            } else {
                // Brand-new local file the server has never seen — an unconditional
                // create is correct here.
                ifMatch = null
            }
            val newEtag = putServerFile(baseUrl, token, path, bytes, ifMatch)
            if (newEtag != null) {
                etags[path] = newEtag
                Log.d(TAG, "pushed $path")
            }
        }

        saveEtags(etags)
    }

    // ── HTTP (OkHttp) ────────────────────────────────────────────────────────────

    private data class ServerEntry(val path: String, val etag: String)

    private fun listServerFiles(baseUrl: String, token: String): List<ServerEntry>? {
        return try {
            val req = Request.Builder()
                .url("$baseUrl/api/files")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val body = res.body?.string() ?: return null
                val arr = JSONArray(body)
                val out = ArrayList<ServerEntry>(arr.length())
                for (i in 0 until arr.length()) {
                    val obj: JSONObject = arr.getJSONObject(i)
                    val path = obj.optString("path", "")
                    val etag = obj.optString("etag", "")
                    if (path.isNotEmpty()) out.add(ServerEntry(path, etag))
                }
                out
            }
        } catch (e: Exception) {
            Log.w(TAG, "listServerFiles failed: ${e.message}")
            null
        }
    }

    /** Returns (bytes, etag) or null on failure. */
    private fun getServerFile(baseUrl: String, token: String, path: String): Pair<ByteArray, String>? {
        return try {
            val req = Request.Builder()
                .url("$baseUrl/api/files/${encodePath(path)}")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val bytes = res.body?.bytes() ?: return null
                val etag = res.header("ETag") ?: etagOf(bytes)
                Pair(bytes, etag)
            }
        } catch (e: Exception) {
            Log.w(TAG, "getServerFile $path failed: ${e.message}")
            null
        }
    }

    /** PUT local bytes; returns the new etag, or null on failure/conflict. */
    private fun putServerFile(
        baseUrl: String,
        token: String,
        path: String,
        bytes: ByteArray,
        ifMatch: String?,
    ): String? {
        return try {
            val media = "application/octet-stream".toMediaTypeOrNull()
            val builder = Request.Builder()
                .url("$baseUrl/api/files/${encodePath(path)}")
                .header("Authorization", "Bearer $token")
                .put(bytes.toRequestBody(media))
            if (ifMatch != null) builder.header("If-Match", ifMatch)
            http.newCall(builder.build()).execute().use { res ->
                if (res.code == 409) {
                    Log.d(TAG, "push conflict on $path; deferring to foreground engine")
                    return null
                }
                if (!res.isSuccessful) return null
                // Server returns { etag } JSON; fall back to header then local hash.
                val body = res.body?.string()
                val fromBody = body?.let {
                    try { JSONObject(it).optString("etag", "") } catch (_: Exception) { "" }
                }
                when {
                    !fromBody.isNullOrEmpty() -> fromBody
                    res.header("ETag") != null -> res.header("ETag")
                    else -> etagOf(bytes)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "putServerFile $path failed: ${e.message}")
            null
        }
    }

    /** Encode each path segment but keep the slashes (matches SyncClient.encodePath). */
    private fun encodePath(path: String): String =
        path.split("/").joinToString("/") { Uri.encode(it) }

    // ── ETag state (SharedPreferences JSON) ──────────────────────────────────────

    private fun loadEtags(): HashMap<String, String> {
        val raw = getSharedPreferences(STATE_PREFS, 0).getString(KEY_ETAGS, null) ?: return HashMap()
        return try {
            val obj = JSONObject(raw)
            val map = HashMap<String, String>()
            for (key in obj.keys()) map[key] = obj.getString(key)
            map
        } catch (e: Exception) {
            HashMap()
        }
    }

    private fun saveEtags(map: Map<String, String>) {
        val obj = JSONObject()
        for ((k, v) in map) obj.put(k, v)
        getSharedPreferences(STATE_PREFS, 0).edit()
            .putString(KEY_ETAGS, obj.toString())
            .apply()
    }

    /** sha256, first 16 hex chars — the server-compatible ETag (ADR-0009). */
    private fun etagOf(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) sb.append("%02x".format(b))
        return sb.substring(0, 16)
    }

    // ── SAF read/write (DocumentsContract, mirrors VaultPlugin helpers) ──────────

    private fun applyTreeUri(uri: Uri) {
        treeUri = uri
        docIdCache.clear()
        val root = DocumentsContract.getTreeDocumentId(uri)
        docIdCache[""] = root
        docIdCache["."] = root
    }

    private fun rootDocId(): String = DocumentsContract.getTreeDocumentId(treeUri!!)

    private fun docUri(docId: String): Uri =
        DocumentsContract.buildDocumentUriUsingTree(treeUri!!, docId)

    /** Read a vault-relative file's raw bytes, or null if it does not exist. */
    private fun readLocal(path: String): ByteArray? {
        val docId = resolveDocId(path) ?: return null
        return try {
            contentResolver.openInputStream(docUri(docId))?.use { it.readBytes() }
        } catch (e: Exception) {
            Log.w(TAG, "readLocal $path failed: ${e.message}")
            null
        }
    }

    /** Write raw bytes to a vault-relative path, creating parent dirs as needed. */
    private fun writeLocal(path: String, bytes: ByteArray) {
        val docId = getOrCreateDocId(path)
        contentResolver.openOutputStream(docUri(docId), "wt")?.use { out ->
            out.write(bytes)
        } ?: throw Exception("Cannot open output stream for: $path")
    }

    /**
     * Enumerate the vault-relative paths this service is responsible for pushing:
     * top-level .md notes and everything under files/ (attachments).
     */
    private fun listLocalSyncPaths(): List<String> {
        val out = ArrayList<String>()
        // Top-level *.md
        for (entry in listChildren("")) {
            if (!entry.isDir && entry.name.endsWith(".md")) out.add(entry.name)
        }
        // files/ recursively
        if (resolveDocId("files") != null) collectFiles("files", out)
        return out
    }

    private data class Child(val name: String, val docId: String, val isDir: Boolean)

    private fun collectFiles(dir: String, out: MutableList<String>) {
        for (entry in listChildren(dir)) {
            val childPath = "$dir/${entry.name}"
            if (entry.isDir) collectFiles(childPath, out) else out.add(childPath)
        }
    }

    private fun listChildren(path: String): List<Child> {
        val parentDocId = if (path.isEmpty() || path == ".") rootDocId() else resolveDocId(path) ?: return emptyList()
        val out = ArrayList<Child>()
        val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, parentDocId)
        contentResolver.query(
            childUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
            ),
            null, null, null,
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            while (cursor.moveToNext()) {
                val name = cursor.getString(nameIdx) ?: continue
                val docId = cursor.getString(idIdx)
                val isDir = cursor.getString(mimeIdx) == MIME_DIR
                val childPath = if (path.isEmpty() || path == ".") name else "$path/$name"
                docIdCache[childPath] = docId
                out.add(Child(name, docId, isDir))
            }
        }
        return out
    }

    /**
     * Resolve a vault-relative path to its SAF document ID, or null if absent.
     * Mirrors VaultPlugin.resolveDocId (walks from the cached root, caching siblings).
     */
    private fun resolveDocId(relPath: String): String? {
        if (relPath.isEmpty() || relPath == ".") return rootDocId()
        docIdCache[relPath]?.let { return it }

        val segments = relPath.split("/")
        var current = rootDocId()
        for ((i, seg) in segments.withIndex()) {
            val pathSoFar = segments.subList(0, i + 1).joinToString("/")
            val cached = docIdCache[pathSoFar]
            if (cached != null) { current = cached; continue }

            val parentPath = if (i == 0) "" else segments.subList(0, i).joinToString("/")
            val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, current)
            var found: String? = null
            contentResolver.query(
                childUri,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                ),
                null, null, null,
            )?.use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val childName = cursor.getString(nameIdx) ?: continue
                    val childId = cursor.getString(idIdx)
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

    /** Ensure a directory (and parents) exists; returns the leaf dir's document ID. */
    private fun ensureDir(relPath: String): String {
        if (relPath.isEmpty() || relPath == ".") return rootDocId()
        docIdCache[relPath]?.let { return it }

        val slashIdx = relPath.lastIndexOf('/')
        val parentPath = if (slashIdx < 0) "" else relPath.substring(0, slashIdx)
        val dirName = relPath.substring(slashIdx + 1)
        val parentDocId = ensureDir(parentPath)

        val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri!!, parentDocId)
        contentResolver.query(
            childUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
            ),
            null, null, null,
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
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

        val newUri = DocumentsContract.createDocument(
            contentResolver, docUri(parentDocId), MIME_DIR, dirName,
        ) ?: throw Exception("Failed to create directory: $relPath")
        val newDocId = DocumentsContract.getDocumentId(newUri)
        docIdCache[relPath] = newDocId
        return newDocId
    }

    /** Return the existing docId for path, creating the file (and parents) if needed. */
    private fun getOrCreateDocId(path: String): String {
        resolveDocId(path)?.let { return it }
        val slashIdx = path.lastIndexOf('/')
        val parentPath = if (slashIdx < 0) "" else path.substring(0, slashIdx)
        val name = path.substring(slashIdx + 1)
        val parentDocId = ensureDir(parentPath)
        val mime = if (name.endsWith(".md")) "text/plain" else "application/octet-stream"
        val newUri = DocumentsContract.createDocument(
            contentResolver, docUri(parentDocId), mime, name,
        ) ?: throw Exception("Failed to create file: $path")
        val docId = DocumentsContract.getDocumentId(newUri)
        docIdCache[path] = docId
        return docId
    }
}

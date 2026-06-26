package app.notes.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Bridges native sync triggers to the WebView SyncEngine (M7).
 *
 * The actual HTTP sync (poll / push / pull, ETag conflict handling) runs in the
 * shared JS SyncEngine while the app is foregrounded. This plugin gives native
 * code a contract to request a sync pass and to read/cache the last-known status
 * for a status-bar indicator. True background sync while the WebView is dead
 * (native OkHttp + SAF) is deferred — see roadmap M7 mobile notes.
 */
@CapacitorPlugin(
    name = "SyncPlugin",
    permissions = [
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS],
        ),
    ],
)
class SyncPlugin : Plugin() {
    private var lastStatus: String = "synced"

    /** Ask the WebView to run a sync pass now (fires the "forceSync" JS event). */
    @PluginMethod
    fun forceSync(call: PluginCall) {
        notifyListeners("forceSync", JSObject())
        call.resolve()
    }

    /** Returns the last sync status reported by the WebView engine. */
    @PluginMethod
    fun getSyncStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("status", lastStatus)
        call.resolve(ret)
    }

    /** Called from JS whenever the engine's status changes, so native can cache it. */
    @PluginMethod
    fun setSyncStatus(call: PluginCall) {
        lastStatus = call.getString("status") ?: "synced"
        call.resolve()
    }

    /**
     * Persist the sync config so the native background service ([SyncForegroundService])
     * can run while the WebView is dead. The JS bridge forwards this on `sync:setConfig`
     * and on vault open. `url`/`token` may be empty for non-server modes.
     */
    @PluginMethod
    fun setConfig(call: PluginCall) {
        val url = call.getString("url") ?: ""
        val token = call.getString("token") ?: ""
        val mode = call.getString("mode") ?: "none"
        val vaultUri = call.getString("vaultUri") ?: ""
        context.getSharedPreferences(SyncForegroundService.CONFIG_PREFS, 0).edit()
            .putString(SyncForegroundService.KEY_URL, url)
            .putString(SyncForegroundService.KEY_TOKEN, token)
            .putString(SyncForegroundService.KEY_MODE, mode)
            .putString(SyncForegroundService.KEY_VAULT_URI, vaultUri)
            .apply()
        call.resolve()
    }

    /** Start the background sync foreground service (server mode only). */
    @PluginMethod
    fun start(call: PluginCall) {
        SyncForegroundService.start(context)
        call.resolve()
    }

    /** Stop the background sync foreground service. */
    @PluginMethod
    fun stop(call: PluginCall) {
        SyncForegroundService.stop(context)
        call.resolve()
    }

    /**
     * Request the runtime POST_NOTIFICATIONS permission (required API 33+) so the
     * foreground service's required ongoing notification is not suppressed. The JS
     * bridge calls this once before the first background start. Resolves with
     * `{ granted: Boolean }`; below API 33 the permission is implicit (granted).
     */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermsCallback")
    }

    @PermissionCallback
    private fun notificationPermsCallback(call: PluginCall) {
        val granted = getPermissionState("notifications").toString() == "granted"
        call.resolve(JSObject().put("granted", granted))
    }
}

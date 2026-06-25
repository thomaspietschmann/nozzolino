package app.notes.mobile

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bridges native sync triggers to the WebView SyncEngine (M7).
 *
 * The actual HTTP sync (poll / push / pull, ETag conflict handling) runs in the
 * shared JS SyncEngine while the app is foregrounded. This plugin gives native
 * code a contract to request a sync pass and to read/cache the last-known status
 * for a status-bar indicator. True background sync while the WebView is dead
 * (native OkHttp + SAF) is deferred — see roadmap M7 mobile notes.
 */
@CapacitorPlugin(name = "SyncPlugin")
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
}

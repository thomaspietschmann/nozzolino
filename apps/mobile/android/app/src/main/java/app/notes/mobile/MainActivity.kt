package app.notes.mobile

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VaultPlugin::class.java)
        registerPlugin(SyncPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}

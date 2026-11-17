package cz.zazijvr.email

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * Zpět:
   *  - tah od LEVÉHO okraje → window.__vrOpenMenu() vysune menu (jen když je tlačítko menu vidět);
   *  - vše ostatní (i když menu otevřít nejde) → výchozí Zpět Tauri: webView.goBack() v historii.
   *    Aplikace si při otevření detailu / menu / nastavení přidává krok do historie (useHistoryBack),
   *    takže Zpět okno zavře; když v historii nic není, aplikace odejde na pozadí.
   * Okraj gesta Android hlásí od verze 14 (prediktivní Zpět); starší verze → vždy běžné Zpět.
   */
  override fun onWebViewCreate(webView: WebView) {
    val callback = object : OnBackPressedCallback(true) {
      private var fromLeftEdge = false

      override fun handleOnBackStarted(backEvent: BackEventCompat) {
        fromLeftEdge = backEvent.swipeEdge == BackEventCompat.EDGE_LEFT
      }

      override fun handleOnBackCancelled() {
        fromLeftEdge = false
      }

      override fun handleOnBackPressed() {
        val left = fromLeftEdge
        fromLeftEdge = false
        if (!left) {
          defaultBack()
          return
        }
        webView.evaluateJavascript("(window.__vrOpenMenu ? window.__vrOpenMenu() : false)") { result ->
          if (result != "true") defaultBack()
        }
      }

      private fun defaultBack() {
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    }
    onBackPressedDispatcher.addCallback(this, callback)
  }
}

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
   * Gesto / tlačítko Zpět předá aplikaci i s okrajem, od kterého gesto začalo:
   * window.__vrBack('left' | 'right' | 'none') vrátí true, když ho aplikace zpracovala
   * (tah od levého okraje vysune menu, jinak zavře otevřený e-mail, menu, nastavení…).
   * Když ho nezpracuje, pokračuje se výchozím chováním (Tauri / systém).
   * Okraj gesta Android hlásí od verze 14 (prediktivní zpět); starší → 'none'.
   */
  override fun onWebViewCreate(webView: WebView) {
    val callback = object : OnBackPressedCallback(true) {
      private var edge = "none"

      override fun handleOnBackStarted(backEvent: BackEventCompat) {
        edge = when (backEvent.swipeEdge) {
          BackEventCompat.EDGE_LEFT -> "left"
          BackEventCompat.EDGE_RIGHT -> "right"
          else -> "none"
        }
      }

      override fun handleOnBackCancelled() {
        edge = "none"
      }

      override fun handleOnBackPressed() {
        val side = edge
        edge = "none"
        webView.evaluateJavascript("(window.__vrBack ? window.__vrBack('$side') : false)") { result ->
          if (result != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    }
    onBackPressedDispatcher.addCallback(this, callback)
  }
}

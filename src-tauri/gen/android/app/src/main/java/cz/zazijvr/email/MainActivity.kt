package cz.zazijvr.email

import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File

class MainActivity : TauriActivity() {
  /** Zpráva z klepnutí na upozornění, která čeká, až bude aplikace (JS) připravená */
  private var pendingOpen: String? = null
  private var webViewRef: WebView? = null
  private var webReady = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Kontrola nové pošty na pozadí (každých ~15 min)
    MailCheckWorker.schedule(this)
    if (savedInstanceState == null) takeOpenRequest(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    takeOpenRequest(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    setupBridge(webView)
    setupBack(webView)
  }

  // ───────────── Klepnutí na upozornění → správný účet a zpráva ─────────────

  private fun takeOpenRequest(intent: Intent?) {
    val json = intent?.getStringExtra(MailCheckWorker.EXTRA_OPEN) ?: return
    intent.removeExtra(MailCheckWorker.EXTRA_OPEN)
    // jen platný JSON objekt – do JS se předává jako řetězec, ne jako kód
    if (try { JSONObject(json); true } catch (e: Exception) { false }) {
      pendingOpen = json
      deliverOpen()
    }
  }

  /** Předá čekající požadavek aplikaci – hned, pokud už běží; jinak po zprávě "ready" z JS */
  private fun deliverOpen() {
    val json = pendingOpen ?: return
    val webView = webViewRef ?: return
    if (!webReady) return
    pendingOpen = null
    val arg = JSONObject.quote(json)
    runOnUiThread {
      webView.evaluateJavascript("(window.__vrOpenFromNotification ? window.__vrOpenFromNotification($arg) : false)") { result ->
        if (result != "true") pendingOpen = json
      }
    }
  }

  // ───────────── Zpět ─────────────

  /**
   *  - tah od LEVÉHO okraje → window.__vrOpenMenu() vysune menu (jen když je tlačítko menu vidět);
   *  - jinak výchozí Zpět Tauri: webView.goBack() v historii (detail, menu, nastavení, psaní…);
   *  - když v historii nic není, nejdřív se zeptá, jestli aplikaci opravdu zavřít.
   * Okraj gesta Android hlásí od verze 14 (prediktivní Zpět); starší verze → vždy běžné Zpět.
   */
  private fun setupBack(webView: WebView) {
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
        if (!webView.canGoBack()) {
          confirmExit(webView)
          return
        }
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    }
    onBackPressedDispatcher.addCallback(this, callback)
  }

  /** Dotaz v designu aplikace (window.__vrConfirmExit); když není k dispozici, systémový dialog */
  private fun confirmExit(webView: WebView) {
    webView.evaluateJavascript("(window.__vrConfirmExit ? window.__vrConfirmExit() : false)") { result ->
      if (result != "true") {
        AlertDialog.Builder(this)
          .setTitle("Zavřít aplikaci?")
          .setPositiveButton("Zavřít") { _, _ -> moveTaskToBack(true) }
          .setNegativeButton("Zůstat", null)
          .show()
      }
    }
  }

  // ───────────── Most z webové části (jen hlavní stránka aplikace) ─────────────

  /**
   * window.VrAndroid.postMessage(JSON) – jen v hlavním rámu aplikace (ne v okně s obsahem e-mailu):
   *  { type: "exit" }                         → aplikace na pozadí (po potvrzení v aplikaci)
   *  { type: "ready" }                        → aplikace připravená přijmout klepnutí na upozornění
   *  { type: "statusBar", light }             → tmavé ikony stavového řádku ve světlém motivu
   *  { type: "config", googleClientId }       → pro kontrolu pošty na pozadí
   *  { type: "openFile", name, mime, data }   → příloha v aplikaci telefonu (PDF…)
   */
  private fun setupBridge(webView: WebView) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(
      webView,
      "VrAndroid",
      setOf("http://tauri.localhost", "https://tauri.localhost"),
    ) { _, message, _, isMainFrame, reply ->
      if (!isMainFrame) return@addWebMessageListener
      val msg = try { JSONObject(message.data ?: return@addWebMessageListener) } catch (e: Exception) { return@addWebMessageListener }
      when (msg.optString("type")) {
        "exit" -> moveTaskToBack(true)
        "ready" -> { webReady = true; deliverOpen() }
        "statusBar" -> {
          val light = msg.optBoolean("light")
          runOnUiThread {
            WindowCompat.getInsetsController(window, window.decorView).apply {
              isAppearanceLightStatusBars = light
              isAppearanceLightNavigationBars = light
            }
          }
        }
        "config" -> getSharedPreferences(MailCheckWorker.PREFS, Context.MODE_PRIVATE).edit()
          .putString(MailCheckWorker.PREF_CLIENT_ID, msg.optString("googleClientId"))
          .apply()
        "openFile" -> openFile(msg, reply)
      }
    }
  }

  private val allowedMime = Regex("^(application/pdf|image/[a-z0-9.+-]+|text/plain|text/csv|application/(msword|rtf|vnd\\.[a-z0-9.+-]+))$")

  private fun openFile(msg: JSONObject, reply: JavaScriptReplyProxy) {
    val mime = msg.optString("mime").lowercase()
    val name = msg.optString("name").replace(Regex("[^\\p{L}\\p{N} ._()-]"), "_").trim('.', ' ').ifEmpty { "priloha" }
    if (!allowedMime.matches(mime)) {
      reply.postMessage("""{"type":"openFileResult","ok":false,"reason":"type"}""")
      return
    }
    val data = msg.optString("data")
    Thread {
      try {
        val dir = File(cacheDir, "attachments").apply { mkdirs() }
        val file = File(dir, name)
        file.writeBytes(Base64.decode(data, Base64.DEFAULT))
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, mime)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        runOnUiThread {
          try {
            startActivity(intent)
            reply.postMessage("""{"type":"openFileResult","ok":true}""")
          } catch (e: ActivityNotFoundException) {
            reply.postMessage("""{"type":"openFileResult","ok":false,"reason":"noapp"}""")
          }
        }
      } catch (e: Exception) {
        runOnUiThread { reply.postMessage("""{"type":"openFileResult","ok":false,"reason":"error"}""") }
      }
    }.start()
  }
}

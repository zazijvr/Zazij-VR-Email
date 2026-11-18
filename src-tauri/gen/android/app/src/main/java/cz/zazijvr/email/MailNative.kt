package cz.zazijvr.email

/** Rust (src-tauri/src/android_mail_check.rs): kontrola nové pošty bez spuštěné aplikace */
object MailNative {
  init {
    System.loadLibrary("app_lib")
  }

  /** Vrací JSON pole upozornění [{ "title", "body", "account" }] */
  @JvmStatic
  external fun checkMail(dataDir: String, googleClientId: String): String
}

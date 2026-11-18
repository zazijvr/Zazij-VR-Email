package cz.zazijvr.email

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/**
 * Každých ~15 minut (minimum Androidu, jen s připojením) zkontroluje Doručené všech účtů
 * a upozorní na nové zprávy. Běží i bez spuštěné aplikace.
 */
class MailCheckWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

  companion object {
    private const val WORK_NAME = "mail-check"
    private const val CHANNEL_ID = "new_mail"
    const val PREFS = "vr_mail"
    const val PREF_CLIENT_ID = "googleClientId"
    /** Extra v Intentu z upozornění: JSON { kind, account, messageId, folder } – MainActivity ho předá aplikaci */
    const val EXTRA_OPEN = "cz.zazijvr.email.OPEN_MAIL"

    fun schedule(context: Context) {
      val request = PeriodicWorkRequestBuilder<MailCheckWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }
  }

  override fun doWork(): Result {
    val ctx = applicationContext
    val clientId = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_CLIENT_ID, "") ?: ""
    val json = try {
      MailNative.checkMail(ctx.dataDir.absolutePath, clientId)
    } catch (e: Throwable) {
      return Result.success()
    }
    try {
      showNotifications(JSONArray(json))
    } catch (e: Throwable) {
      // chybná data – příště znovu
    }
    return Result.success()
  }

  @SuppressLint("MissingPermission")
  private fun showNotifications(items: JSONArray) {
    if (items.length() == 0) return
    val ctx = applicationContext
    val nm = NotificationManagerCompat.from(ctx)
    if (!nm.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Nová pošta", NotificationManager.IMPORTANCE_DEFAULT)
      channel.description = "Upozornění na nové e-maily ve všech účtech"
      ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val base = (System.currentTimeMillis() % 1_000_000).toInt() * 16
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      val body = item.optString("body")
      // Každé upozornění má vlastní PendingIntent (jiné requestCode) s účtem a zprávou,
      // jinak by se přepsaly a klepnutí by otevřelo naposledy aktivní účet
      val open = Intent(ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      item.optJSONObject("open")?.let { open.putExtra(EXTRA_OPEN, it.toString()) }
      val pending = PendingIntent.getActivity(ctx, base + i, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_email)
        .setContentTitle(item.optString("title"))
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setSubText(item.optString("account"))
        .setAutoCancel(true)
        .setContentIntent(pending)
        .build()
      try {
        nm.notify(base + i, notification)
      } catch (e: SecurityException) {
        return
      }
    }
  }
}

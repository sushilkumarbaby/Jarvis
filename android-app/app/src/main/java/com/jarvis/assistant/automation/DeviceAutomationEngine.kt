package com.jarvis.assistant.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.jarvis.assistant.JarvisApplication
import java.util.Calendar
import java.util.concurrent.TimeUnit

class DeviceAutomationEngine(private val context: Context) {

    fun tryDirectAppIntent(hindiOrEnglishCommand: String): String? {
        val q = hindiOrEnglishCommand.lowercase()
        return when {
            q.contains("youtube") -> {
                launchPackageOrUrl("com.google.android.youtube", "https://youtube.com")
                "Ji, main YouTube khol raha hoon."
            }
            q.contains("whatsapp") -> {
                launchPackageOrUrl("com.whatsapp", "https://wa.me/")
                "WhatsApp khol raha hoon."
            }
            q.contains("settings") || q.contains("setting") -> {
                val i = Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
                "Phone ki Settings khol raha hoon."
            }
            q.contains("notification") && (q.contains("read") || q.contains("padh") || q.contains("batao")) -> {
                val latest = JarvisNotificationListener.recentNotifications.take(3)
                if (latest.isEmpty()) "Abhi koi nayi permitted notification nahi hai."
                else "Aapki haal ki notifications: ${latest.joinToString("; ")}"
            }
            else -> null
        }
    }

    private fun launchPackageOrUrl(packageName: String, fallbackUrl: String) {
        val pm = context.packageManager
        val launch = pm.getLaunchIntentForPackage(packageName)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launch)
        } else {
            val web = Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(web)
        }
    }

    /**
     * Schedules a daily recurring Hindi reminder (e.g. "roz subah 7 baje exercise").
     */
    fun scheduleDailyReminder(id: String, hour24: Int, minute: Int, messageHindi: String) {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour24)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            if (before(now)) add(Calendar.DAY_OF_YEAR, 1)
        }
        val initialDelayMs = target.timeInMillis - now.timeInMillis

        val workRequest = PeriodicWorkRequestBuilder<DailyReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(initialDelayMs, TimeUnit.MILLISECONDS)
            .setInputData(workDataOf("message" to messageHindi))
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "jarvis_reminder_$id",
            ExistingPeriodicWorkPolicy.UPDATE,
            workRequest
        )
    }

    /**
     * Optional Tasker / Shizuku integration broadcast hook.
     */
    fun triggerTaskerTask(taskName: String) {
        val intent = Intent("net.dinglisch.android.tasker.ACTION_TASK").apply {
            putExtra("task_name", taskName)
        }
        context.sendBroadcast(intent)
    }
}

class DailyReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val msg = inputData.getString("message") ?: "JARVIS Reminder"
        val notif = NotificationCompat.Builder(applicationContext, JarvisApplication.CHANNEL_REMINDERS)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("JARVIS Reminder")
            .setContentText(msg)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        runCatching { NotificationManagerCompat.from(applicationContext).notify(msg.hashCode(), notif) }
        return Result.success()
    }
}

class ReminderBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val msg = intent.getStringExtra("message") ?: return
        val notif = NotificationCompat.Builder(context, JarvisApplication.CHANNEL_REMINDERS)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("JARVIS Reminder")
            .setContentText(msg)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(msg.hashCode(), notif) }
    }
}

package com.jarvis.assistant

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.jarvis.assistant.memory.MemoryRepository

class JarvisApplication : Application() {
    lateinit var memoryRepository: MemoryRepository
        private set

    override fun onCreate() {
        super.onCreate()
        memoryRepository = MemoryRepository(this)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val wakeChannel = NotificationChannel(
                CHANNEL_WAKE_WORD,
                getString(R.string.wake_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent indicator while local wake-word microphone detection is active."
                setShowBadge(false)
            }

            val reminderChannel = NotificationChannel(
                CHANNEL_REMINDERS,
                getString(R.string.reminder_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Scheduled Hindi voice reminders and automation alerts."
            }

            manager.createNotificationChannel(wakeChannel)
            manager.createNotificationChannel(reminderChannel)
        }
    }

    companion object {
        const val CHANNEL_WAKE_WORD = "jarvis_wake_word"
        const val CHANNEL_REMINDERS = "jarvis_reminders"
    }
}

package com.jarvis.assistant.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.jarvis.assistant.JarvisApplication
import com.jarvis.assistant.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.sqrt

/**
 * Dedicated local wake-word foreground service.
 *
 * ANDROID ARCHITECTURE NOTES:
 * 1. Android 14+ (API 34) requires foregroundServiceType="microphone" and runtime RECORD_AUDIO
 *    started while the app is in an eligible foreground state (or BOOT_COMPLETED exemption for
 *    user-configured Voice Assistant / SYSTEM_ALERT_WINDOW / battery-exempt apps).
 * 2. Audio is analyzed strictly on-device in a 16kHz PCM ring buffer. No raw audio is streamed
 *    to any cloud endpoint until the wake word ("Jarvis" / "Hey Jarvis") is locally detected.
 * 3. For production offline keyword spotting, swap `LocalKeywordSpotter.evaluateFrame()` with
 *    Picovoice Porcupine (.ppn) or Vosk small-hi/en-in model without changing the FGS lifecycle.
 */
class WakeWordForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var audioRecord: AudioRecord? = null
    private var isListening = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildPersistentNotification("Listening locally for \"Jarvis\"…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notification)
        }

        startLocalWakeWordLoop()
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startLocalWakeWordLoop() {
        if (isListening) return
        val app = application as JarvisApplication
        if (!app.memoryRepository.isWakeWordEnabled()) {
            stopSelf()
            return
        }

        isListening = true
        val sampleRate = 16000
        val frameSize = 512
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(frameSize * 4)

        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBuffer
        )
        audioRecord = recorder
        recorder.startRecording()

        serviceScope.launch(Dispatchers.IO) {
            val pcmFrame = ShortArray(frameSize)
            val energyThreshold = (1.1f - app.memoryRepository.getWakeWordSensitivity()) * 2400f
            var consecutiveSpeechFrames = 0

            while (isActive && isListening) {
                val read = recorder.read(pcmFrame, 0, frameSize)
                if (read > 0) {
                    val rms = computeRms(pcmFrame, read)
                    if (rms > energyThreshold) {
                        consecutiveSpeechFrames++
                        // Energy gate passed -> feed into local keyword spotter
                        if (consecutiveSpeechFrames >= 4 && LocalKeywordSpotter.detectJarvis(pcmFrame, read)) {
                            consecutiveSpeechFrames = 0
                            triggerWakeActivation()
                        }
                    } else {
                        consecutiveSpeechFrames = 0
                    }
                }
            }
        }
    }

    private fun triggerWakeActivation() {
        val pm = getSystemService(PowerManager::class.java)
        val wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "jarvis:wakeActivation"
        )
        wakeLock.acquire(5_000L)

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_WAKE_TRIGGERED, true)
        }
        startActivity(launchIntent)
    }

    private fun computeRms(samples: ShortArray, count: Int): Float {
        var sum = 0.0
        for (i in 0 until count) {
            sum += samples[i] * samples[i]
        }
        return sqrt(sum / count).toFloat()
    }

    private fun buildPersistentNotification(statusText: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, WakeWordForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, JarvisApplication.CHANNEL_WAKE_WORD)
            .setContentTitle("JARVIS Hands-Free Active")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Pause Mic", stopIntent)
            .build()
    }

    override fun onDestroy() {
        isListening = false
        serviceScope.cancel()
        runCatching { audioRecord?.stop(); audioRecord?.release() }
        audioRecord = null
        super.onDestroy()
    }

    companion object {
        const val NOTIF_ID = 1001
        const val ACTION_STOP = "com.jarvis.assistant.ACTION_STOP_WAKE"
        const val EXTRA_WAKE_TRIGGERED = "extra_wake_triggered"
    }
}

/**
 * Pluggable local keyword spotter interface.
 * Replace with Picovoice Porcupine ("jarvis_android.ppn") or Vosk small-hi/en-in model
 * in app/src/main/assets/ for production phonetic wake-word accuracy.
 */
object LocalKeywordSpotter {
    fun detectJarvis(pcmFrame: ShortArray, count: Int): Boolean {
        // Placeholder zero-cloud DSP hook: real deployments bind JNI Porcupine.process(pcmFrame)
        // or Vosk Recognizer.acceptWaveForm() here.
        return false
    }
}

class BootRecoveryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val app = context.applicationContext as? JarvisApplication ?: return
            if (app.memoryRepository.isWakeWordEnabled()) {
                val svc = Intent(context, WakeWordForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc)
                } else {
                    context.startService(svc)
                }
            }
        }
    }
}

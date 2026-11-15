package com.jarvis.assistant.service

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import com.jarvis.assistant.ui.MainActivity

/**
 * Android Default Digital Assistant Role integration (VoiceInteractionService).
 *
 * LOCK SCREEN BEHAVIOR & SECURITY BOUNDARY:
 * - When JARVIS is selected as the user's Default Digital Assistant in Android Settings,
 *   the OS allows VoiceInteractionSession to display over the lock screen (`SHOW_WITH_ASSIST`)
 *   for ordinary conversational queries without unlocking the phone.
 * - Note: True hardware DSP `AlwaysOnHotwordDetector` is restricted by Android to privileged
 *   system-signed/preloaded apps. Third-party apps use `WakeWordForegroundService` + Default
 *   Assistant Role (`ROLE_ASSISTANT`) + `showWhenLocked=true` Activity.
 * - Sensitive actions (banking, settings changes, unlocking private data) MUST call
 *   `KeyguardManager.requestDismissKeyguard()` — never bypassing biometric/PIN security.
 */
class JarvisVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
    }
}

class JarvisVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return JarvisVoiceInteractionSession(this)
    }
}

class JarvisVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(WakeWordForegroundService.EXTRA_WAKE_TRIGGERED, true)
        }
        startAssistantActivity(intent)
    }

    fun requestUnlockForSensitiveAction(activity: android.app.Activity, onUnlocked: () -> Unit) {
        val kg = context.getSystemService(KeyguardManager::class.java)
        if (kg.isKeyguardLocked) {
            kg.requestDismissKeyguard(activity, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() {
                    onUnlocked()
                }
            })
        } else {
            onUnlocked()
        }
    }
}

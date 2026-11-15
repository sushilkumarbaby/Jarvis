# JARVIS Native Android (Kotlin + Material 3) Setup & Reality Guide

## 1. Environment Audit (Why APK Wasn't Built in Sandbox)
The AI Studio container runs on Linux x86_64 with Node.js 22 and Python 3, without `javac`, Gradle, or the Android SDK (`sdkmanager`, `adb`). Because an APK cannot be compiled or tested on physical Android hardware inside this container, this repository provides:
1. **Complete Native Android Kotlin Project** (`/android-app/`) ready to open in Android Studio Ladybug+ or build via `./gradlew assembleDebug`.
2. **Live Full-Stack Web + Installable Android PWA Companion** running right now with Gemini Live full-duplex Hindi voice, wake-word listening, memory, automations, and AI Creation Studio.

## 2. Actual Android Restrictions & How JARVIS Handles Them
- **Background Microphone (Android 11–15):** Android blocks silent background mic recording. JARVIS uses `WakeWordForegroundService` with `foregroundServiceType="microphone"` and displays a persistent, transparent mic notification (`Pause Mic` quick action included).
- **Screen-Off / Lock-Screen Wake Word:**
  - Google Assistant uses hardware DSP `AlwaysOnHotwordDetector`, which Android restricts to system-privileged/preloaded apps.
  - Third-party apps like JARVIS achieve hands-free operation via:
    1. `WakeWordForegroundService` + `PARTIAL_WAKE_LOCK` + Battery Optimization exemption (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
    2. Setting JARVIS as **Default Digital Assistant** (`VoiceInteractionService` / `ROLE_ASSISTANT`) so `supportsLaunchVoiceAssistFromKeyguard="true"` works on the lock screen without bypassing biometric/PIN security.
- **OEM Battery Killers (Xiaomi MIUI/HyperOS, Samsung OneUI, Oppo/Realme, Vivo):** Users must enable *Autostart* and set Battery Saver to *Unrestricted* for JARVIS in Android App Info.
- **Accessibility & Notifications:** Both `JarvisAccessibilityService` and `JarvisNotificationListener` require explicit manual activation by the user in Android Settings.

## 3. Build & Install APK on Your Phone
```bash
cd android-app
# Open in Android Studio OR build via Gradle Wrapper:
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 4. Production Offline Wake-Word Engine Hook
`WakeWordForegroundService.kt` streams 16kHz PCM audio strictly locally in memory until `LocalKeywordSpotter.detectJarvis()` triggers. To enable production offline wake-word spotting for `"Jarvis"` / `"Hey Jarvis"`, drop either:
- **Picovoice Porcupine** (`porcupine-android` + custom `jarvis_android.ppn`), or
- **Vosk Android** (`vosk-model-small-hi-0.22` / `en-in`)
into `LocalKeywordSpotter.detectJarvis()`.

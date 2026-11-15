package com.jarvis.assistant.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.speech.tts.TextToSpeech
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

enum class VoiceSessionState {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING,
    EXECUTING
}

enum class VoiceTone(val label: String, val stylePrompt: String, val pitch: Float, val rate: Float) {
    CALM("Calm", "Calm, composed, reassuring male Hindi companion voice", 0.90f, 0.98f),
    ENTHUSIASTIC("Enthusiastic", "Enthusiastic, energetic, upbeat male Hindi companion voice", 0.98f, 1.08f),
    FORMAL("Formal", "Formal, respectful, articulate male Hindi executive voice", 0.86f, 1.00f),
    FRIENDLY("Friendly", "Warm, conversational, cheerful male Hindi companion voice", 0.94f, 1.03f),
    EMPATHETIC("Empathetic", "Gentle, supportive, emotionally attentive male Hindi voice", 0.92f, 0.95f)
}

/**
 * Real-time Hindi-first conversational audio engine.
 * Streams 16kHz PCM mic audio to Gemini Live WebSocket and plays back 24kHz PCM audio
 * with hardware AcousticEchoCanceler + immediate barge-in interruption.
 * Falls back cleanly to Android TextToSpeech (hi-IN) when offline or unary mode is active.
 */
class HindiVoiceEngine(
    private val context: Context,
    private val scope: CoroutineScope
) : TextToSpeech.OnInitListener {

    private val _state = MutableStateFlow(VoiceSessionState.IDLE)
    val state: StateFlow<VoiceSessionState> = _state

    private var tts: TextToSpeech? = TextToSpeech(context, this)
    private var ttsReady = false
    private var currentTone = VoiceTone.CALM
    private var webSocket: WebSocket? = null
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var captureJob: Job? = null

    fun setVoiceTone(tone: VoiceTone) {
        currentTone = tone
        tts?.setPitch(tone.pitch)
        tts?.setSpeechRate(tone.rate)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val hi = Locale("hi", "IN")
            val result = tts?.setLanguage(hi)
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
            tts?.setPitch(currentTone.pitch)
            tts?.setSpeechRate(currentTone.rate)
        }
    }

    fun speakHindiFallback(text: String) {
        if (!ttsReady) return
        _state.value = VoiceSessionState.SPEAKING
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis_${System.currentTimeMillis()}")
    }

    fun interruptSpeaking() {
        tts?.stop()
        runCatching {
            audioTrack?.pause()
            audioTrack?.flush()
        }
        _state.value = VoiceSessionState.LISTENING
    }

    @SuppressLint("MissingPermission")
    fun startLiveSession(
        geminiApiKey: String,
        systemInstruction: String,
        onTranscript: (role: String, text: String) -> Unit,
        onError: (String) -> Unit
    ) {
        stopLiveSession()
        val url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=$geminiApiKey"
        val client = OkHttpClient()
        val request = Request.Builder().url(url).build()

        initAudioOutputTrack()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                val setup = JSONObject().put("setup", JSONObject().apply {
                    put("model", "models/gemini-2.5-flash-native-audio-preview-09-2025")
                    put("generationConfig", JSONObject().apply {
                        put("responseModalities", JSONArray().put("AUDIO"))
                        put("speechConfig", JSONObject().put("voiceConfig", JSONObject().put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Charon"))))
                    })
                    put("realtimeInputConfig", JSONObject().apply {
                        put("automaticActivityDetection", JSONObject().apply {
                            put("startOfSpeechSensitivity", "START_SENSITIVITY_LOW")
                            put("endOfSpeechSensitivity", "END_SENSITIVITY_LOW")
                            put("prefixPaddingMs", 220)
                            put("silenceDurationMs", 850)
                        })
                        put("activityHandling", "START_OF_ACTIVITY_INTERRUPTS")
                    })
                    put("systemInstruction", JSONObject().put("parts", JSONArray().put(
                        JSONObject().put("text", "$systemInstruction\nVoice Tone: ${currentTone.stylePrompt}.")
                    )))
                })
                ws.send(setup.toString())
                _state.value = VoiceSessionState.LISTENING
                startPcmMicCapture(ws)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                val root = JSONObject(text)
                val serverContent = root.optJSONObject("serverContent") ?: return

                if (serverContent.optBoolean("interrupted", false)) {
                    interruptSpeaking()
                    return
                }

                val modelTurn = serverContent.optJSONObject("modelTurn")
                val parts = modelTurn?.optJSONArray("parts")
                if (parts != null) {
                    for (i in 0 until parts.length()) {
                        val part = parts.getJSONObject(i)
                        part.optJSONObject("inlineData")?.optString("data")?.let { b64 ->
                            val pcmBytes = Base64.decode(b64, Base64.DEFAULT)
                            _state.value = VoiceSessionState.SPEAKING
                            audioTrack?.play()
                            audioTrack?.write(pcmBytes, 0, pcmBytes.size)
                        }
                        part.optString("text").takeIf { it.isNotBlank() }?.let { txt ->
                            onTranscript("jarvis", txt)
                        }
                    }
                }

                if (serverContent.optBoolean("turnComplete", false)) {
                    _state.value = VoiceSessionState.LISTENING
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                onError(t.message ?: "Live WebSocket error")
                _state.value = VoiceSessionState.IDLE
            }
        })
    }

    @SuppressLint("MissingPermission")
    private fun startPcmMicCapture(ws: WebSocket) {
        val sampleRate = 16000
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBuf * 2
        )
        if (AcousticEchoCanceler.isAvailable()) {
            AcousticEchoCanceler.create(record.audioSessionId)?.enabled = true
        }
        audioRecord = record
        record.startRecording()

        captureJob = scope.launch(Dispatchers.IO) {
            val buffer = ByteArray(minBuf)
            val silentBuffer = ByteArray(minBuf)
            var bargeInFrames = 0
            while (isActive) {
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) {
                    val rms = computePcm16Rms(buffer, read)
                    val isSpeaking = _state.value == VoiceSessionState.SPEAKING
                    val payloadBytes = if (isSpeaking) {
                        if (rms >= 0.06) bargeInFrames++ else bargeInFrames = 0
                        if (bargeInFrames >= 2) buffer.copyOf(read) else silentBuffer.copyOf(read)
                    } else {
                        bargeInFrames = 0
                        if (rms >= 0.008) buffer.copyOf(read) else silentBuffer.copyOf(read)
                    }
                    val b64 = Base64.encodeToString(payloadBytes, Base64.NO_WRAP)
                    val msg = JSONObject().put("realtimeInput", JSONObject().put("audio", JSONObject().apply {
                        put("mimeType", "audio/pcm;rate=16000")
                        put("data", b64)
                    }))
                    ws.send(msg.toString())
                }
            }
        }
    }

    private fun computePcm16Rms(bytes: ByteArray, length: Int): Double {
        if (length < 2) return 0.0
        var sumSq = 0.0
        val samples = length / 2
        for (i in 0 until samples) {
            val lo = bytes[i * 2].toInt() and 0xFF
            val hi = bytes[i * 2 + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort() / 32768.0
            sumSq += sample * sample
        }
        return kotlin.math.sqrt(sumSq / samples)
    }

    private fun initAudioOutputTrack() {
        val sampleRate = 24000
        val minBuf = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(minBuf * 2)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
    }

    fun stopLiveSession() {
        captureJob?.cancel()
        runCatching { audioRecord?.stop(); audioRecord?.release() }
        runCatching { audioTrack?.stop(); audioTrack?.release() }
        runCatching { webSocket?.close(1000, "Session closed") }
        audioRecord = null
        audioTrack = null
        webSocket = null
        _state.value = VoiceSessionState.IDLE
    }

    fun release() {
        stopLiveSession()
        tts?.shutdown()
    }
}

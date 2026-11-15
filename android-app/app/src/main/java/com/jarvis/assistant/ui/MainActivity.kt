package com.jarvis.assistant.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.jarvis.assistant.JarvisApplication
import com.jarvis.assistant.agents.AgentOrchestrator
import com.jarvis.assistant.audio.HindiVoiceEngine
import com.jarvis.assistant.audio.VoiceSessionState
import com.jarvis.assistant.audio.VoiceTone
import com.jarvis.assistant.automation.DeviceAutomationEngine
import com.jarvis.assistant.brain.HINDI_COMPANION_PROMPT
import com.jarvis.assistant.brain.MultiProviderAiBrain
import com.jarvis.assistant.service.WakeWordForegroundService
import kotlinx.coroutines.launch
import kotlin.math.sin

class MainActivity : ComponentActivity() {

    private lateinit var voiceEngine: HindiVoiceEngine
    private lateinit var orchestrator: AgentOrchestrator

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.RECORD_AUDIO] == true) {
            startWakeWordServiceIfEnabled()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as JarvisApplication
        voiceEngine = HindiVoiceEngine(this, lifecycleScope)
        orchestrator = AgentOrchestrator(
            context = this,
            brain = MultiProviderAiBrain(),
            memoryRepo = app.memoryRepository,
            automationEngine = DeviceAutomationEngine(this)
        )

        requestRuntimePermissions()

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF090D16),
                    surface = Color(0xFF111827),
                    primary = Color(0xFF0EA5E9),
                    onPrimary = Color.White,
                    onBackground = Color(0xFFF1F5F9),
                    onSurface = Color(0xFFF1F5F9)
                )
            ) {
                JarvisHudScreen(
                    voiceEngine = voiceEngine,
                    onSendCommand = { text ->
                        lifecycleScope.launch {
                            val result = orchestrator.dispatch(text)
                            voiceEngine.speakHindiFallback(result.outputText)
                        }
                    },
                    onToggleWakeService = { enabled ->
                        app.memoryRepository.setWakeWordEnabled(enabled)
                        if (enabled) startWakeWordServiceIfEnabled()
                        else stopService(Intent(this, WakeWordForegroundService::class.java))
                    },
                    onOpenAssistantSettings = {
                        startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS))
                    }
                )
            }
        }
    }

    private fun requestRuntimePermissions() {
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        } else {
            startWakeWordServiceIfEnabled()
        }
    }

    private fun startWakeWordServiceIfEnabled() {
        val app = application as JarvisApplication
        if (!app.memoryRepository.isWakeWordEnabled()) return
        val svc = Intent(this, WakeWordForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc)
        else startService(svc)
    }

    override fun onDestroy() {
        voiceEngine.release()
        super.onDestroy()
    }
}

@Composable
fun JarvisHudScreen(
    voiceEngine: HindiVoiceEngine,
    onSendCommand: (String) -> Unit,
    onToggleWakeService: (Boolean) -> Unit,
    onOpenAssistantSettings: () -> Unit
) {
    val state by voiceEngine.state.collectAsState()
    var wakeEnabled by remember { mutableStateOf(true) }
    var selectedTone by remember { mutableStateOf(VoiceTone.CALM) }
    var inputText by remember { mutableStateOf("") }
    val messages = remember { mutableStateListOf("JARVIS: Namaste! Main sun raha hoon — boliye kya madad karun?") }

    val transition = rememberInfiniteTransition(label = "orb")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 6.283f,
        animationSpec = infiniteRepeatable(
            animation = tween(2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF090D16))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("JARVIS", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
            TextButton(onClick = onOpenAssistantSettings) {
                Text("Default Assistant", color = Color(0xFF38BDF8))
            }
        }

        Spacer(Modifier.height(16.dp))

        // Circular Acoustic Orb & Waveform
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(200.dp)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2, size.height / 2)
                val baseRadius = size.minDimension * 0.34f
                val pulse = if (state == VoiceSessionState.IDLE) 0f else sin(phase) * 10f
                drawCircle(
                    brush = Brush.radialGradient(
                        listOf(Color(0xFF0EA5E9).copy(alpha = 0.35f), Color.Transparent)
                    ),
                    radius = baseRadius + 34f + pulse,
                    center = center
                )
                drawCircle(
                    color = Color(0xFF38BDF8),
                    radius = baseRadius + pulse,
                    center = center,
                    style = Stroke(width = 4f)
                )
            }
            Text(
                text = when (state) {
                    VoiceSessionState.IDLE -> "Ready"
                    VoiceSessionState.LISTENING -> "Sun raha hoon…"
                    VoiceSessionState.THINKING -> "Soch raha hoon…"
                    VoiceSessionState.SPEAKING -> "Bol raha hoon…"
                    VoiceSessionState.EXECUTING -> "Executing…"
                },
                color = Color(0xFFE0F2FE),
                fontWeight = FontWeight.SemiBold
            )
        }

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Always-on Wake Word (\"Jarvis\")", color = Color(0xFFCBD5E1), fontSize = 14.sp)
            Switch(
                checked = wakeEnabled,
                onCheckedChange = {
                    wakeEnabled = it
                    onToggleWakeService(it)
                }
            )
        }

        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            listOf(VoiceTone.CALM, VoiceTone.ENTHUSIASTIC, VoiceTone.FORMAL).forEach { tone ->
                FilterChip(
                    selected = selectedTone == tone,
                    onClick = {
                        selectedTone = tone
                        voiceEngine.setVoiceTone(tone)
                    },
                    label = { Text(tone.label, fontSize = 12.sp) }
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(16.dp))
                .padding(12.dp)
        ) {
            items(messages) { msg ->
                Text(msg, color = Color(0xFFE2E8F0), fontSize = 14.sp, modifier = Modifier.padding(vertical = 6.dp))
            }
        }

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                placeholder = { Text("Hindi ya Hinglish mein likhein…") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = {
                    if (state == VoiceSessionState.SPEAKING) {
                        voiceEngine.interruptSpeaking()
                    } else if (inputText.isNotBlank()) {
                        val cmd = inputText
                        messages.add("You: $cmd")
                        inputText = ""
                        onSendCommand(cmd)
                    }
                },
                modifier = Modifier
                    .size(52.dp)
                    .background(Color(0xFF0EA5E9), CircleShape)
            ) {
                Icon(
                    imageVector = if (state == VoiceSessionState.SPEAKING) Icons.Default.Stop else Icons.Default.Mic,
                    contentDescription = "Voice Action",
                    tint = Color.White
                )
            }
        }
    }
}

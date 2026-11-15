package com.jarvis.assistant.agents

import android.content.Context
import com.jarvis.assistant.automation.DeviceAutomationEngine
import com.jarvis.assistant.brain.AiProviderType
import com.jarvis.assistant.brain.BrainRequest
import com.jarvis.assistant.brain.MultiProviderAiBrain
import com.jarvis.assistant.memory.MemoryRepository

enum class SpecialistAgentType(val displayName: String, val hindiSummary: String) {
    RESEARCH("Research Agent", "Web research aur verified jankari"),
    CODING("Coding Agent", "Android, backend aur code generation"),
    ANDROID("Android Agent", "Apps kholna, intents aur UI actions"),
    BROWSER("Browser Agent", "Web search aur URL navigation"),
    AUTOMATION("Automation Agent", "Reminders, cron aur Tasker workflows"),
    IMAGE_GEN("Image Generation Agent", "Thumbnails aur visual concepts"),
    VIDEO_PROD("Video Production Agent", "YouTube scripts, storyboards aur subtitles"),
    VOICE("Voice Agent", "Hindi TTS, voiceovers aur audio pipelines"),
    DATA_ANALYSIS("Data Analysis Agent", "Metrics, summaries aur structured reports"),
    FILE_MGMT("File Management Agent", "Files organize aur search karna"),
    SECURITY("Security Agent", "Permissions audit aur secret protection")
}

data class AgentExecutionResult(
    val agent: SpecialistAgentType,
    val outputText: String,
    val verified: Boolean
)

class AgentOrchestrator(
    private val context: Context,
    private val brain: MultiProviderAiBrain,
    private val memoryRepo: MemoryRepository,
    private val automationEngine: DeviceAutomationEngine
) {
    fun selectAgent(userPrompt: String): SpecialistAgentType {
        val q = userPrompt.lowercase()
        return when {
            q.contains("youtube") || q.contains("video") || q.contains("script") -> SpecialistAgentType.VIDEO_PROD
            q.contains("image") || q.contains("thumbnail") || q.contains("photo") -> SpecialistAgentType.IMAGE_GEN
            q.contains("remind") || q.contains("alarm") || q.contains("baje") || q.contains("schedule") -> SpecialistAgentType.AUTOMATION
            q.contains("open ") || q.contains("kholo") || q.contains("whatsapp") || q.contains("call") -> SpecialistAgentType.ANDROID
            q.contains("code") || q.contains("kotlin") || q.contains("bug") || q.contains("app bana") -> SpecialistAgentType.CODING
            q.contains("password") || q.contains("otp") || q.contains("permission") || q.contains("privacy") -> SpecialistAgentType.SECURITY
            q.contains("file") || q.contains("folder") || q.contains("pdf") -> SpecialistAgentType.FILE_MGMT
            q.contains("voiceover") || q.contains("audio") || q.contains("awaz") -> SpecialistAgentType.VOICE
            q.contains("analyze") || q.contains("csv") || q.contains("data") -> SpecialistAgentType.DATA_ANALYSIS
            q.contains("search") || q.contains("browser") || q.contains("website") -> SpecialistAgentType.BROWSER
            else -> SpecialistAgentType.RESEARCH
        }
    }

    suspend fun dispatch(userPrompt: String): AgentExecutionResult {
        val agent = selectAgent(userPrompt)

        if (memoryRepo.containsSensitiveSecret(userPrompt)) {
            return AgentExecutionResult(
                agent = SpecialistAgentType.SECURITY,
                outputText = "Suraksha niyam: Main passwords, OTP ya API secrets ko memory mein save nahi karti hoon.",
                verified = true
            )
        }

        if (agent == SpecialistAgentType.ANDROID) {
            val handled = automationEngine.tryDirectAppIntent(userPrompt)
            if (handled != null) {
                return AgentExecutionResult(agent = agent, outputText = handled, verified = true)
            }
        }

        val memoryContext = memoryRepo.getAllMemories()
            .take(12)
            .joinToString("\n") { "- [${it.category}] ${it.key}: ${it.value}" }

        val response = brain.reasonWithFallback(
            request = BrainRequest(
                userMessage = "[Delegate: ${agent.displayName}] $userPrompt",
                memoryContext = memoryContext
            ),
            priorityOrder = listOf(
                AiProviderType.GEMINI,
                AiProviderType.OPENROUTER,
                AiProviderType.OPENAI_COMPATIBLE,
                AiProviderType.ANTHROPIC_CLAUDE,
                AiProviderType.LOCAL_OLLAMA
            ),
            apiKeyResolver = { memoryRepo.getProviderApiKey(it.name) }
        )

        return response.fold(
            onSuccess = { AgentExecutionResult(agent = agent, outputText = it.text, verified = true) },
            onFailure = {
                AgentExecutionResult(
                    agent = agent,
                    outputText = "Abhi AI provider se sampark nahi ho pa raha hai (${it.message}). Kripya Settings mein API key check karein.",
                    verified = false
                )
            }
        )
    }
}

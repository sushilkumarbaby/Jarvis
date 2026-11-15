package com.jarvis.assistant.brain

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class AiProviderType {
    GEMINI,
    OPENAI_COMPATIBLE,
    ANTHROPIC_CLAUDE,
    OPENROUTER,
    LOCAL_OLLAMA
}

data class BrainRequest(
    val userMessage: String,
    val languageHint: String = "hi-IN",
    val memoryContext: String = "",
    val systemPrompt: String = HINDI_COMPANION_PROMPT
)

data class BrainResponse(
    val text: String,
    val providerUsed: AiProviderType,
    val modelUsed: String,
    val suggestedAgent: String? = null
)

interface AiBrainProvider {
    val providerType: AiProviderType
    suspend fun generate(request: BrainRequest, apiKey: String): Result<BrainResponse>
}

class MultiProviderAiBrain(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()
) {
    private val geminiProvider = GeminiRestProvider(httpClient)
    private val openAiProvider = OpenAiCompatibleProvider(httpClient)
    private val claudeProvider = AnthropicClaudeProvider(httpClient)

    suspend fun reasonWithFallback(
        request: BrainRequest,
        priorityOrder: List<AiProviderType>,
        apiKeyResolver: (AiProviderType) -> String,
        ollamaBaseUrl: String = "http://127.0.0.1:11434"
    ): Result<BrainResponse> = withContext(Dispatchers.IO) {
        var lastError: Throwable? = null
        for (provider in priorityOrder) {
            val key = apiKeyResolver(provider)
            if (provider != AiProviderType.LOCAL_OLLAMA && key.isBlank()) continue

            val result = when (provider) {
                AiProviderType.GEMINI -> geminiProvider.generate(request, key)
                AiProviderType.OPENAI_COMPATIBLE -> openAiProvider.generate(
                    request, key, "https://api.openai.com/v1/chat/completions", "gpt-4o-mini", provider
                )
                AiProviderType.OPENROUTER -> openAiProvider.generate(
                    request, key, "https://openrouter.ai/api/v1/chat/completions", "google/gemini-2.5-flash", provider
                )
                AiProviderType.LOCAL_OLLAMA -> openAiProvider.generate(
                    request, "ollama", "$ollamaBaseUrl/v1/chat/completions", "llama3.2:latest", provider
                )
                AiProviderType.ANTHROPIC_CLAUDE -> claudeProvider.generate(request, key)
            }

            if (result.isSuccess) return@withContext result
            lastError = result.exceptionOrNull()
        }
        Result.failure(lastError ?: IllegalStateException("No configured AI provider succeeded."))
    }
}

private class GeminiRestProvider(private val client: OkHttpClient) : AiBrainProvider {
    override val providerType = AiProviderType.GEMINI

    override suspend fun generate(request: BrainRequest, apiKey: String): Result<BrainResponse> = runCatching {
        val model = "gemini-2.5-flash"
        val url = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey"
        val bodyJson = JSONObject().apply {
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", request.systemPrompt + "\nMemory:\n" + request.memoryContext))))
            put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", request.userMessage)))))
        }
        val req = Request.Builder()
            .url(url)
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            if (!res.isSuccessful) error("Gemini HTTP ${res.code}: $raw")
            val json = JSONObject(raw)
            val text = json.getJSONArray("candidates")
                .getJSONObject(0)
                .getJSONObject("content")
                .getJSONArray("parts")
                .getJSONObject(0)
                .getString("text")
            BrainResponse(text = text, providerUsed = providerType, modelUsed = model)
        }
    }
}

private class OpenAiCompatibleProvider(private val client: OkHttpClient) {
    fun generate(
        request: BrainRequest,
        apiKey: String,
        endpoint: String,
        model: String,
        providerType: AiProviderType
    ): Result<BrainResponse> = runCatching {
        val bodyJson = JSONObject().apply {
            put("model", model)
            put("messages", JSONArray().apply {
                put(JSONObject().put("role", "system").put("content", request.systemPrompt + "\nMemory:\n" + request.memoryContext))
                put(JSONObject().put("role", "user").put("content", request.userMessage))
            })
        }
        val req = Request.Builder()
            .url(endpoint)
            .addHeader("Authorization", "Bearer $apiKey")
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            if (!res.isSuccessful) error("$providerType HTTP ${res.code}: $raw")
            val text = JSONObject(raw)
                .getJSONArray("choices")
                .getJSONObject(0)
                .getJSONObject("message")
                .getString("content")
            BrainResponse(text = text, providerUsed = providerType, modelUsed = model)
        }
    }
}

private class AnthropicClaudeProvider(private val client: OkHttpClient) : AiBrainProvider {
    override val providerType = AiProviderType.ANTHROPIC_CLAUDE

    override suspend fun generate(request: BrainRequest, apiKey: String): Result<BrainResponse> = runCatching {
        val model = "claude-3-5-sonnet-latest"
        val bodyJson = JSONObject().apply {
            put("model", model)
            put("max_tokens", 1024)
            put("system", request.systemPrompt + "\nMemory:\n" + request.memoryContext)
            put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", request.userMessage)))
        }
        val req = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            if (!res.isSuccessful) error("Claude HTTP ${res.code}: $raw")
            val text = JSONObject(raw).getJSONArray("content").getJSONObject(0).getString("text")
            BrainResponse(text = text, providerUsed = providerType, modelUsed = model)
        }
    }
}

const val HINDI_COMPANION_PROMPT = """
You are JARVIS, an intelligent, warm, calm, lightly humorous Hindi-first male personal AI companion on Android.
Default language: Natural conversational Hindi (Devanagari or Hinglish matching user's tone) using masculine Hindi verb forms ("Main sun raha hoon", "Main check karta hoon"). Switch seamlessly if the user asks in English.
Keep spoken responses concise, clear, natural, and free of robotic filler.
"""

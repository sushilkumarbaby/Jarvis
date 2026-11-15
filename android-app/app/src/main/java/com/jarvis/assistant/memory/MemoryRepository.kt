package com.jarvis.assistant.memory

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
enum class MemoryCategory {
    PREFERENCE,
    PROJECT,
    COMMAND,
    INSTRUCTION,
    TASK,
    CONVERSATION
}

@Serializable
data class MemoryEntry(
    val id: String,
    val category: MemoryCategory,
    val key: String,
    val value: String,
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Encrypted persistent memory store backed by Android Keystore MasterKey.
 * Enforces strict secret-redaction so OTPs, passwords, and API secrets are never
 * stored inside ordinary conversational memory.
 */
class MemoryRepository(context: Context) {
    private val json = Json { ignoreUnknownKeys = true }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "jarvis_secure_vault",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val secretPatterns = listOf(
        Regex("""\b\d{4,8}\b(?=.*\b(otp|pin|code|passcode)\b)""", RegexOption.IGNORE_CASE),
        Regex("""(password|passwd|pin|otp|cvv|secret)\s*[:=is]+\s*\S+""", RegexOption.IGNORE_CASE),
        Regex("""AIza[0-9A-Za-z\-_]{20,}"""),
        Regex("""sk-[0-9A-Za-z\-_]{16,}"""),
        Regex("""ghp_[0-9A-Za-z]{20,}""")
    )

    fun containsSensitiveSecret(text: String): Boolean {
        return secretPatterns.any { it.containsMatchIn(text) }
    }

    fun getAllMemories(): List<MemoryEntry> {
        val raw = encryptedPrefs.getString(KEY_MEMORIES, "[]") ?: "[]"
        return runCatching { json.decodeFromString<List<MemoryEntry>>(raw) }
            .getOrDefault(emptyList())
    }

    fun upsertMemory(category: MemoryCategory, key: String, value: String): Result<MemoryEntry> {
        if (containsSensitiveSecret("$key $value")) {
            return Result.failure(
                SecurityException("Blocked: Sensitive OTP, password, or API secret cannot be stored in assistant memory.")
            )
        }
        val list = getAllMemories().toMutableList()
        val entry = MemoryEntry(
            id = "${category.name.lowercase()}_${key.lowercase().replace(Regex("[^a-z0-9]"), "_")}",
            category = category,
            key = key.trim(),
            value = value.trim(),
            updatedAt = System.currentTimeMillis()
        )
        list.removeAll { it.id == entry.id }
        list.add(0, entry)
        encryptedPrefs.edit().putString(KEY_MEMORIES, json.encodeToString(list)).apply()
        return Result.success(entry)
    }

    fun deleteMemory(id: String) {
        val updated = getAllMemories().filterNot { it.id == id }
        encryptedPrefs.edit().putString(KEY_MEMORIES, json.encodeToString(updated)).apply()
    }

    // Dedicated API Key vault (strictly isolated from LLM memory)
    fun saveProviderApiKey(providerId: String, apiKey: String) {
        encryptedPrefs.edit().putString("api_key_$providerId", apiKey.trim()).apply()
    }

    fun getProviderApiKey(providerId: String): String {
        return encryptedPrefs.getString("api_key_$providerId", "") ?: ""
    }

    fun setWakeWordEnabled(enabled: Boolean) {
        encryptedPrefs.edit().putBoolean(KEY_WAKE_WORD_ENABLED, enabled).apply()
    }

    fun isWakeWordEnabled(): Boolean = encryptedPrefs.getBoolean(KEY_WAKE_WORD_ENABLED, true)

    fun setWakeWordSensitivity(sensitivity: Float) {
        encryptedPrefs.edit().putFloat(KEY_WAKE_SENSITIVITY, sensitivity.coerceIn(0.1f, 1.0f)).apply()
    }

    fun getWakeWordSensitivity(): Float = encryptedPrefs.getFloat(KEY_WAKE_SENSITIVITY, 0.65f)

    companion object {
        private const val KEY_MEMORIES = "memories_json"
        private const val KEY_WAKE_WORD_ENABLED = "wake_word_enabled"
        private const val KEY_WAKE_SENSITIVITY = "wake_word_sensitivity"
    }
}

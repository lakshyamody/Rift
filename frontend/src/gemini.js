/**
 * gemini.js — Core Gemini REST API module.
 * Uses direct REST calls per the official API docs.
 * All components import from here — never call fetch directly.
 *
 * API key lives in frontend/.env as VITE_GEMINI_API_KEY
 * (that file is .gitignored — never committed)
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 
 * Models to try in order of preference. 
 * If the primary model hits quota limits, we fall back to others.
 */
const MODELS = [
    "gemini-2.0-flash",    // Primary
    "gemini-flash-latest", // Fallback 1 (points to latest stable flash, e.g., 1.5)
    "gemini-pro-latest",   // Fallback 2 (points to latest stable pro, e.g., 1.5)
];

/** Read API key from Vite env — set in frontend/.env */
export function getApiKey() {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error("VITE_GEMINI_API_KEY is not set in .env");
    return key;
}

/** Convert internal {role, content} messages to Gemini Contents format. */
function toContents(history) {
    return history.map(m => ({
        role: m.role === "assistant" ? "model" : "user",   // docs use "model"
        parts: [{ text: m.content }],                        // Part per docs
    }));
}

/** Build the common request body. */
function buildBody(systemPrompt, history) {
    return JSON.stringify({
        system_instruction: {
            parts: [{ text: systemPrompt }],                   // separate per docs
        },
        contents: toContents(history),
        generationConfig: {
            temperature: 0.3,                              // factual, low hallucination
            maxOutputTokens: 2048,
            topP: 0.8,
        },
    });
}

/** Utility for waiting */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** 
 * Enhanced fetch with Exponential Backoff and Model Fallback.
 * Handles 429 (Rate Limit) and quota errors.
 */
async function retryableFetch(urlBuilder, options, maxRetries = 3) {
    let lastError = null;

    // Try each model in the list
    for (const modelId of MODELS) {
        const url = urlBuilder(modelId);

        // Try multiple times with exponential backoff for the current model
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[Gemini] Retrying ${modelId} (attempt ${attempt + 1}) in ${delay}ms...`);
                    await sleep(delay);
                }

                const res = await fetch(url, options);

                if (res.ok) return { res, modelId };

                const errData = await res.json().catch(() => ({}));
                const message = errData.error?.message || `HTTP ${res.status}`;
                const reason = errData.error?.status || "";

                // If it's a 429 (Rate Limit), Quota Exceeded, or 404 (Not Found/Unsupported)
                if (res.status === 429 || res.status === 404 || message.toLowerCase().includes("quota")) {
                    console.error(`[Gemini] Error for ${modelId}: ${message} (Status: ${res.status})`);
                    lastError = new Error(message);

                    // If we've hit quota or model is not found, move to NEXT model immediately
                    if (res.status === 404 || message.toLowerCase().includes("quota") || attempt === maxRetries - 1) {
                        break;
                    }
                    continue;
                }

                // For other errors (400, 401, etc.), don't retry, just throw
                throw new Error(message);

            } catch (err) {
                lastError = err;
                // If it's a network error or fetch failed, retry
                if (attempt === maxRetries - 1) break;
            }
        }
    }

    throw lastError || new Error("Failed to reach Gemini API after multiple attempts and fallbacks.");
}

export async function geminiGenerate(apiKey, systemPrompt, history) {
    const urlBuilder = (model) => `${BASE}/${model}:generateContent`;
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: buildBody(systemPrompt, history),
    };

    const { res, modelId } = await retryableFetch(urlBuilder, options);
    const data = await res.json();
    return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response generated.",
        modelId
    };
}

export async function geminiStream(apiKey, systemPrompt, history, onChunk) {
    const urlBuilder = (model) => `${BASE}/${model}:streamGenerateContent?alt=sse`;
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: buildBody(systemPrompt, history),
    };

    const { res, modelId } = await retryableFetch(urlBuilder, options);

    // Notify chunk callback of the model being used
    onChunk("", "", modelId);

    // SSE — read line by line, each is a GenerateContentResponse per docs
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split("\n")) {
            if (!line.startsWith("data: ")) continue;          // SSE prefix
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;

            try {
                const parsed = JSON.parse(json);
                // Same path as standard mode per docs
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                if (text) {
                    full += text;
                    onChunk(text, full);
                }
            } catch {
                // malformed chunk — skip silently
            }
        }
    }

    return full;  // complete text when stream finishes
}

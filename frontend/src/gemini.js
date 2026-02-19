/**
 * gemini.js — Core Gemini REST API module.
 * Uses direct REST calls per the official API docs.
 * All components import from here — never call fetch directly.
 *
 * API key lives in frontend/.env as VITE_GEMINI_API_KEY
 * (that file is .gitignored — never committed)
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.0-flash"; // confirmed available

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

/**
 * Standard (non-streaming) generate.
 * Use for: report generation, JSON export tasks, one-shot summaries.
 * Returns the complete text string.
 */
export async function geminiGenerate(apiKey, systemPrompt, history) {
    const res = await fetch(`${BASE}/${MODEL}:generateContent`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,                         // header auth per docs
        },
        body: buildBody(systemPrompt, history),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `Gemini error: HTTP ${res.status}`);
    }

    const data = await res.json();
    // Response path per docs: candidates[0].content.parts[0].text
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response generated.";
}

/**
 * Streaming generate — uses SSE (Server-Sent Events).
 * Use for: chatbot responses — gives word-by-word UX.
 *
 * @param {string}   apiKey       – Gemini API key
 * @param {string}   systemPrompt – system instruction
 * @param {Array}    history      – [{role, content}, ...]
 * @param {Function} onChunk      – (fragment, fullAccumulated) called per chunk
 * @returns {Promise<string>}    – the full response text when stream ends
 */
export async function geminiStream(apiKey, systemPrompt, history, onChunk) {
    const res = await fetch(
        `${BASE}/${MODEL}:streamGenerateContent?alt=sse`,   // ?alt=sse per docs
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            body: buildBody(systemPrompt, history),
        }
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `Gemini stream error: HTTP ${res.status}`);
    }

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

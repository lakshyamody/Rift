import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, FileText, Network, Send, Download, X, ChevronRight, AlertTriangle, Shield, Zap } from "lucide-react";
import { GoogleGenAI } from "@google/genai";

const SEVERITY_COLORS = {
    CRITICAL: { bg: "bg-red-900/20", border: "border-red-500/30", text: "text-red-400" },
    HIGH: { bg: "bg-orange-900/20", border: "border-orange-500/30", text: "text-orange-400" },
    MEDIUM: { bg: "bg-yellow-900/20", border: "border-yellow-500/30", text: "text-yellow-400" },
};

function getSuggestedQuestions(ringData) {
    if (!ringData) return [];
    return [
        `Who is the orchestrator of ${ringData.ring_id}?`,
        `How did the money flow through this ring?`,
        `What laundering techniques were used?`,
        `Which accounts should be frozen first?`,
        `Are there connections to other rings?`,
        `What is the total amount laundered?`,
        `What should investigators do next?`,
        `Which account has the highest suspicion score?`,
    ];
}

export default function FraudChatbot({ ringData, allCrossRingPatterns, onClose }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("chat");
    const [apiKey, setApiKey] = useState(localStorage.getItem("gemini_api_key") || "");
    const [showApiKeyInput, setShowApiKeyInput] = useState(!localStorage.getItem("gemini_api_key"));
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const suggested = getSuggestedQuestions(ringData);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!showApiKeyInput && inputRef.current) inputRef.current.focus();
    }, [showApiKeyInput]);

    const saveApiKey = () => {
        localStorage.setItem("gemini_api_key", apiKey);
        setShowApiKeyInput(false);
    };

    async function sendMessage(text) {
        if (!text.trim() || !apiKey) return;

        const userMsg = { role: "user", content: text };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setInput("");
        setLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey });

            const historyForGemini = updated.slice(0, -1).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
            }));

            const chat = ai.chats.create({
                model: "gemini-2.0-flash",
                systemInstruction: ringData.system_prompt,
                history: historyForGemini
            });

            const response = await chat.sendMessage({ message: text });
            const reply = response.text || "No response from model.";

            setMessages(prev => [...prev, { role: "assistant", content: reply }]);
        } catch (err) {
            console.error("Gemini error:", err);
            setMessages(prev => [
                ...prev,
                {
                    role: "assistant",
                    content: `⚠️ Error: ${err.message || "Could not reach Gemini API. Check your API key."}`
                }
            ]);
        } finally {
            setLoading(false);
        }
    }

    const downloadReport = () => {
        const blob = new Blob([ringData.ring_report], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${ringData.ring_id}_investigation_report.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
                        <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white tracking-tight">{ringData?.ring_id}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Gemini Investigator</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Tabs */}
                    {[
                        { id: "chat", icon: MessageCircle, label: "Chat" },
                        { id: "report", icon: FileText, label: "Report" },
                        { id: "patterns", icon: Network, label: "Patterns" },
                    ].map(({ id, icon: Icon, label }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${activeTab === id
                                    ? "bg-primary/20 text-primary border-primary/30"
                                    : "text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                                }`}
                        >
                            <Icon className="w-3 h-3" />
                            {label}
                        </button>
                    ))}

                    <button
                        onClick={() => setShowApiKeyInput(v => !v)}
                        title="Set Gemini API Key"
                        className="ml-1 p-1.5 rounded-lg text-slate-600 hover:text-primary hover:bg-primary/10 border border-slate-800 hover:border-primary/30 transition-all"
                    >
                        <Zap className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-900/20 border border-slate-800 transition-all"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* API Key Input */}
            {showApiKeyInput && (
                <div className="px-5 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-3">
                    <Zap className="w-4 h-4 text-primary shrink-0" />
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveApiKey()}
                        placeholder="Enter your Gemini API key..."
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-primary/50"
                    />
                    <button
                        onClick={saveApiKey}
                        className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-primary/80 transition-all"
                    >
                        Save
                    </button>
                </div>
            )}

            {/* Chat Tab */}
            {activeTab === "chat" && (
                <>
                    {/* Suggested Questions */}
                    {messages.length === 0 && (
                        <div className="px-5 pt-4 pb-3 border-b border-slate-800/50">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Suggested Questions</p>
                            <div className="flex flex-wrap gap-2">
                                {suggested.map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(q)}
                                        className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-primary/30 text-slate-400 hover:text-slate-200 rounded-lg px-2.5 py-1.5 transition-all text-left"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
                        {messages.length === 0 && (
                            <div className="flex items-center justify-center h-full text-slate-700 text-xs">
                                Ask anything about this fraud ring...
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div
                                key={i}
                                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                {m.role === "assistant" && (
                                    <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                                        <Shield className="w-3 h-3 text-primary" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[80%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user"
                                            ? "bg-primary/20 border border-primary/30 text-slate-200 rounded-tr-sm"
                                            : "bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-sm"
                                        }`}
                                >
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-3 justify-start">
                                <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                                    <Shield className="w-3 h-3 text-primary animate-pulse" />
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl rounded-tl-sm px-4 py-3 text-xs text-slate-500">
                                    <span className="animate-pulse">Analyzing...</span>
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="px-5 py-4 border-t border-slate-800 flex gap-3">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                            placeholder={apiKey ? "Ask anything about this fraud ring..." : "Set your Gemini API key to chat ↑"}
                            disabled={!apiKey}
                            className="flex-1 bg-slate-900 border border-slate-800 focus:border-primary/40 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 outline-none transition-colors disabled:opacity-50"
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={loading || !input.trim() || !apiKey}
                            className="p-2.5 bg-primary hover:bg-primary/80 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </>
            )}

            {/* Report Tab */}
            {activeTab === "report" && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex justify-end px-5 pt-4">
                        <button
                            onClick={downloadReport}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-600/30 text-emerald-400 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download Report
                        </button>
                    </div>
                    <pre className="px-5 py-4 text-[11px] font-mono leading-relaxed text-slate-400 whitespace-pre-wrap">
                        {ringData?.ring_report || "No report available."}
                    </pre>
                </div>
            )}

            {/* Patterns Tab */}
            {activeTab === "patterns" && (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">
                        Cross-Ring Patterns Detected Across the Network
                    </p>
                    {allCrossRingPatterns?.length > 0 ? (
                        allCrossRingPatterns.map((p, i) => {
                            const colors = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.MEDIUM;
                            return (
                                <div key={i} className={`p-4 rounded-xl border ${colors.bg} ${colors.border}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className={`w-4 h-4 ${colors.text}`} />
                                        <span className={`text-xs font-bold uppercase tracking-widest ${colors.text}`}>
                                            {p.pattern_name.replace(/_/g, " ")}
                                        </span>
                                        <span className={`ml-auto text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${colors.border} ${colors.text}`}>
                                            {p.severity}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mb-2">{p.description}</p>
                                    <div className="flex items-start gap-2">
                                        <ChevronRight className="w-3 h-3 text-slate-600 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-slate-500 italic">{p.implication}</p>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex items-center justify-center h-40 text-slate-700 text-xs">
                            No cross-ring patterns detected yet.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

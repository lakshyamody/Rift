import React, { useState, useRef, useEffect } from "react";
import {
    MessageCircle, FileText, Network, Send, Download, X,
    ChevronRight, AlertTriangle, Shield, Bot, User, TrendingUp,
    Clock, DollarSign, Activity
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";

const SEVERITY_COLORS = {
    CRITICAL: { bg: "bg-red-950/40", border: "border-red-500/25", text: "text-red-400", badge: "bg-red-500/15" },
    HIGH: { bg: "bg-amber-950/30", border: "border-amber-500/25", text: "text-amber-400", badge: "bg-amber-500/15" },
    MEDIUM: { bg: "bg-yellow-950/25", border: "border-yellow-500/20", text: "text-yellow-400", badge: "bg-yellow-500/15" },
};

const TABS = [
    { id: "chat", icon: MessageCircle, label: "Investigate" },
    { id: "report", icon: FileText, label: "Report" },
    { id: "patterns", icon: Network, label: "Cross-Ring" },
];

const QUESTIONS = (ring) => [
    `Who is the orchestrator of ${ring}?`,
    "How did money flow through this ring?",
    "Which accounts should be frozen immediately?",
    "What laundering techniques were used?",
    "Are there links to other rings?",
    "What is the total amount laundered?",
    "What should investigators prioritize?",
    "Which account has the highest suspicion score?",
];

function RingStatBar({ label, value, icon: Icon, color = "text-slate-400" }) {
    return (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/60 rounded-xl border border-slate-800/60">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
            <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-widest font-bold text-slate-600">{label}</div>
                <div className={`text-xs font-bold truncate ${color}`}>{value}</div>
            </div>
        </div>
    );
}

function ThinkingDots() {
    return (
        <div className="flex gap-1 items-center px-1 py-0.5">
            {[0, 0.2, 0.4].map((delay, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: `${delay}s`, animationDuration: "0.9s" }} />
            ))}
        </div>
    );
}

export default function FraudChatbot({ ringData, allCrossRingPatterns, onClose }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("chat");
    const apiKey = localStorage.getItem("gemini_api_key") || "";
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

    async function sendMessage(text) {
        if (!text.trim() || !apiKey) return;
        const updated = [...messages, { role: "user", content: text }];
        setMessages(updated);
        setInput("");
        setLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey });
            const history = updated.slice(0, -1).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
            }));
            const chat = ai.chats.create({
                model: "gemini-2.0-flash",
                systemInstruction: ringData.system_prompt,
                history
            });
            const response = await chat.sendMessage({ message: text });
            setMessages(prev => [...prev, { role: "assistant", content: response.text || "No response." }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: "assistant",
                content: `⚠️ ${err.message || "Could not reach Gemini API."}`
            }]);
        } finally {
            setLoading(false);
        }
    }

    const downloadReport = () => {
        const blob = new Blob([ringData.ring_report], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement("a"), { href: url, download: `${ringData.ring_id}_report.txt` }).click();
        URL.revokeObjectURL(url);
    };

    const summary = ringData?.summary || {};
    const riskScore = ringData?.risk_score || 0;
    const riskColor = riskScore >= 90 ? "text-red-400" : riskScore >= 75 ? "text-amber-400" : "text-yellow-400";

    return (
        <div className="flex flex-col h-full bg-[#0b0f1a] rounded-2xl border border-slate-800/60 overflow-hidden shadow-2xl shadow-black/40">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-900/90 to-slate-900/60 border-b border-slate-800/60 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/30 to-blue-500/20 flex items-center justify-center border border-violet-500/20">
                            <Bot className="w-4.5 h-4.5 text-violet-400" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0b0f1a]" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white">{ringData?.ring_id}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${riskColor}`}>
                                Risk {riskScore}/100
                            </span>
                            <span className="text-slate-700">·</span>
                            <span className="text-[9px] text-slate-600 uppercase tracking-wider">{ringData?.pattern_type}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {TABS.map(({ id, icon: Icon, label }) => (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === id
                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/25"
                                    : "text-slate-600 border border-transparent hover:text-slate-400 hover:bg-slate-800/50"
                                }`}>
                            <Icon className="w-3 h-3" />
                            {label}
                        </button>
                    ))}
                    <button onClick={onClose}
                        className="ml-1 p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Ring Stats Strip */}
            {activeTab === "chat" && (
                <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-800/40 bg-slate-950/40">
                    <RingStatBar label="Laundered" icon={DollarSign} color="text-red-400"
                        value={summary.estimated_laundered != null ? `₹${Number(summary.estimated_laundered).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"} />
                    <RingStatBar label="Transactions" icon={Activity} color="text-blue-400"
                        value={summary.num_transactions ?? "—"} />
                    <RingStatBar label="Duration" icon={Clock} color="text-amber-400"
                        value={summary.duration_hours != null ? `${summary.duration_hours}h` : "—"} />
                </div>
            )}

            {/* Chat Tab */}
            {activeTab === "chat" && (
                <>
                    {/* Suggested Questions */}
                    {messages.length === 0 && (
                        <div className="px-5 pt-4 pb-3 border-b border-slate-800/30">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2.5">Quick Questions</p>
                            <div className="flex flex-wrap gap-1.5">
                                {QUESTIONS(ringData?.ring_id).slice(0, 6).map((q, i) => (
                                    <button key={i} onClick={() => sendMessage(q)}
                                        className="text-[10px] bg-slate-900/70 hover:bg-violet-500/10 border border-slate-800 hover:border-violet-500/30 text-slate-500 hover:text-violet-300 rounded-lg px-2.5 py-1.5 transition-all text-left leading-tight">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-8">
                                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                                    <Bot className="w-6 h-6 text-violet-500/60" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-500">Gemini Investigator</p>
                                    <p className="text-xs text-slate-700 mt-0.5">Ask any question about {ringData?.ring_id}</p>
                                </div>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                {m.role === "assistant" && (
                                    <div className="w-7 h-7 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Bot className="w-3.5 h-3.5 text-violet-400" />
                                    </div>
                                )}
                                <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user"
                                        ? "bg-violet-600/20 border border-violet-500/25 text-slate-200 rounded-tr-sm"
                                        : "bg-slate-900/80 border border-slate-800/60 text-slate-300 rounded-tl-sm"
                                    }`}>{m.content}</div>
                                {m.role === "user" && (
                                    <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <User className="w-3.5 h-3.5 text-slate-400" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-2.5 justify-start">
                                <div className="w-7 h-7 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                                </div>
                                <div className="bg-slate-900/80 border border-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-3">
                                    <ThinkingDots />
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="px-5 py-4 border-t border-slate-800/40 bg-slate-950/30">
                        <div className="flex gap-2.5 items-center bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-2 focus-within:border-violet-500/30 transition-colors">
                            <input ref={inputRef} value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                                placeholder="Ask anything about this fraud ring..."
                                className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-700 outline-none py-1" />
                            <button onClick={() => sendMessage(input)}
                                disabled={loading || !input.trim() || !apiKey}
                                className="p-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-700 text-white rounded-xl transition-all shrink-0">
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Report Tab */}
            {activeTab === "report" && (
                <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="px-5 pt-4 pb-3 border-b border-slate-800/40 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-400">Investigation Report — {ringData?.ring_id}</p>
                        <button onClick={downloadReport}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                            <Download className="w-3 h-3" />
                            Download .txt
                        </button>
                    </div>
                    <pre className="flex-1 overflow-y-auto px-5 py-4 text-[11px] font-mono leading-relaxed text-slate-500 whitespace-pre-wrap custom-scrollbar">
                        {ringData?.ring_report || "No report available."}
                    </pre>
                </div>
            )}

            {/* Patterns Tab */}
            {activeTab === "patterns" && (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-4">
                        Cross-Ring Intelligence
                    </p>
                    {allCrossRingPatterns?.length > 0 ? allCrossRingPatterns.map((p, i) => {
                        const c = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.MEDIUM;
                        return (
                            <div key={i} className={`p-4 rounded-xl border ${c.bg} ${c.border}`}>
                                <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className={`w-3.5 h-3.5 ${c.text}`} />
                                        <span className={`text-[11px] font-bold uppercase tracking-wide ${c.text}`}>
                                            {p.pattern_name.replace(/_/g, " ")}
                                        </span>
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${c.badge} ${c.text} border ${c.border}`}>
                                        {p.severity}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mb-2 leading-relaxed">{p.description}</p>
                                <div className="flex items-start gap-2 pt-2 border-t border-slate-800/40">
                                    <ChevronRight className="w-3 h-3 text-slate-600 mt-0.5 shrink-0" />
                                    <p className="text-[10px] text-slate-600 italic leading-relaxed">{p.implication}</p>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="h-40 flex flex-col items-center justify-center gap-3 text-slate-700">
                            <TrendingUp className="w-8 h-8 opacity-20" />
                            <p className="text-xs">No cross-ring patterns detected</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

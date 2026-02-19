import React, { useState, useRef, useEffect } from "react";
import {
    MessageCircle, FileText, Network, Send, Download, X,
    ChevronRight, AlertTriangle, Shield, Bot, User, TrendingUp,
    Clock, DollarSign, Activity, Users, Target, ArrowRight,
    ArrowUpRight, Lock, Eye, Layers, CheckCircle
} from "lucide-react";
import { geminiStream } from "../gemini";
import DownloadManager from "./DownloadManager";

// ── Constants ─────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = "AIzaSyAUDHBZ4sl2KXRkwifZCHF3WwTlUV2B7n8";

const SEVERITY_COLORS = {
    CRITICAL: { bg: "bg-red-950/40", border: "border-red-500/25", text: "text-red-400", badge: "bg-red-500/15" },
    HIGH: { bg: "bg-amber-950/30", border: "border-amber-500/25", text: "text-amber-400", badge: "bg-amber-500/15" },
    MEDIUM: { bg: "bg-yellow-950/25", border: "border-yellow-500/20", text: "text-yellow-400", badge: "bg-yellow-500/15" },
};

const ROLE_STYLE = {
    ORCHESTRATOR: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25", icon: Target },
    COLLECTOR: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25", icon: Layers },
    SHELL: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25", icon: Shield },
    MULE: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25", icon: Users },
    EXIT_POINT: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25", icon: ArrowUpRight },
    RECRUITER: { bg: "bg-pink-500/15", text: "text-pink-400", border: "border-pink-500/25", icon: Users },
};

const TABS = [
    { id: "chat", icon: MessageCircle, label: "Investigate" },
    { id: "report", icon: FileText, label: "Report" },
    { id: "patterns", icon: Network, label: "Cross-Ring" },
    { id: "downloads", icon: Download, label: "Downloads" },
];

// Pattern-aware question suggestions
const QUESTIONS = {
    cycle: ["How did the circular routing work?", "Which account started the cycle?", "How many times did the cycle repeat?", "What is the total amount circulated?"],
    fan_out: ["Who is the orchestrator?", "How many accounts received money?", "Is there a structuring pattern?", "Where did dispersed funds go?"],
    fan_in: ["Which accounts fed the collector?", "Are the senders related?", "How fast did money move after aggregation?"],
    shell: ["How many shell hops?", "What is the entry and exit point?", "Which shell account is most suspicious?"],
    default: ["Summarize this fraud ring.", "Which accounts should be frozen first?", "What laundering techniques were used?", "Are there connections to other rings?", "What should investigators do next?", "Which account has the highest suspicion score?", "How long did this operation run?", "What is the total amount laundered?"],
};

function getSuggestions(patternType) {
    const key = Object.keys(QUESTIONS).find(k => patternType?.toLowerCase().includes(k));
    return [...(QUESTIONS[key] ?? []), ...QUESTIONS.default].slice(0, 8);
}

function fmt(n) { return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = "text-violet-400" }) {
    return (
        <div className="bg-slate-900/70 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</span>
                {Icon && <Icon className={`w-3.5 h-3.5 ${color}`} />}
            </div>
            <div className={`text-xl font-extrabold tabular-nums leading-none ${color}`}>{value}</div>
            {sub && <div className="text-[9px] text-slate-600">{sub}</div>}
        </div>
    );
}

function RoleTag({ role, accounts }) {
    const style = ROLE_STYLE[role] || { bg: "bg-slate-800", text: "text-slate-400", border: "border-slate-700", icon: Shield };
    const Icon = style.icon;
    if (!accounts?.length) return null;
    return (
        <div className={`flex flex-col gap-1.5 p-3 rounded-xl border ${style.bg} ${style.border}`}>
            <div className="flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${style.text}`} />
                <span className={`text-[9px] font-bold uppercase tracking-widest ${style.text}`}>{role.replace("_", " ")}</span>
                <span className={`ml-auto text-[9px] font-bold ${style.text}`}>{accounts.length}</span>
            </div>
            <div className="flex flex-wrap gap-1">
                {accounts.map(a => (
                    <span key={a} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${style.bg} ${style.border} ${style.text}`}>{a}</span>
                ))}
            </div>
        </div>
    );
}

// ── Streaming cursor ──────────────────────────────────────────────────────────
function StreamingBubble({ text }) {
    return (
        <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-violet-400" />
            </div>
            <div className="max-w-[82%] bg-slate-900/70 border border-slate-800/50 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {text}
                {/* Blinking cursor */}
                <span className="inline-block w-1.5 h-3.5 bg-violet-400 ml-0.5 align-text-bottom animate-pulse rounded-sm" />
            </div>
        </div>
    );
}

function ThinkingDots() {
    return (
        <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-3 h-3 text-violet-400" />
            </div>
            <div className="bg-slate-900/70 border border-slate-800/50 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                {[0, 0.2, 0.4].map((d, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500/60 animate-bounce"
                        style={{ animationDelay: `${d}s`, animationDuration: "0.9s" }} />
                ))}
            </div>
        </div>
    );
}

// ── Rich Report View ──────────────────────────────────────────────────────────
function ReportView({ ringData, onDownloadTxt }) {
    const fs = ringData?.summary || {};
    const riskScore = ringData?.risk_score || 0;
    const riskColor = riskScore >= 90 ? "text-red-400" : riskScore >= 75 ? "text-amber-400" : "text-yellow-300";
    const riskBg = riskScore >= 90 ? "bg-red-500/10 border-red-500/20" : riskScore >= 75 ? "bg-amber-500/10 border-amber-500/20" : "bg-yellow-500/10 border-yellow-500/20";

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-none px-5 py-3.5 border-b border-slate-800/50 flex items-center justify-between">
                <div>
                    <div className="text-xs font-bold text-slate-200">{ringData?.ring_id}</div>
                    <div className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-widest">Investigation Report</div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${riskBg} ${riskColor}`}>
                        Risk {riskScore}/100
                    </span>
                    <button onClick={onDownloadTxt}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all">
                        <Download className="w-2.5 h-2.5" /> Download
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-5">
                {/* Financial Stats */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Financial Summary</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <StatCard label="Estimated Laundered" icon={DollarSign} color="text-red-400"
                            value={`₹${fmt(fs.estimated_laundered)}`} sub="out-of-ring funds" />
                        <StatCard label="External Inflow" icon={ArrowRight} color="text-orange-400"
                            value={`₹${fmt(fs.external_inflow)}`} sub="injected from outside" />
                        <StatCard label="Internal Circulation" icon={Activity} color="text-blue-400"
                            value={`₹${fmt(fs.total_internal_flow)}`} sub="within-ring movement" />
                        <StatCard label="Avg Transaction" icon={TrendingUp} color="text-violet-400"
                            value={`₹${fmt(fs.avg_transaction_size)}`} sub={`across ${fs.num_transactions || 0} txns`} />
                    </div>
                </div>

                {/* Timeline */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operation Timeline</span>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Start</div>
                            <div className="text-[11px] font-mono text-slate-300 truncate">
                                {fs.operation_start ? new Date(fs.operation_start).toLocaleString() : "—"}
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-px bg-slate-700" />
                            <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-bold whitespace-nowrap">
                                {fs.duration_hours ?? "?"}h
                            </div>
                            <div className="w-12 h-px bg-slate-700" />
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">End</div>
                            <div className="text-[11px] font-mono text-slate-300 truncate">
                                {fs.operation_end ? new Date(fs.operation_end).toLocaleString() : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Entry → Exit */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Network Structure</span>
                    </div>
                    <div className="mb-3 bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div className="text-center">
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Entry Point</div>
                            <div className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                                {ringData?.entry_point || "—"}
                            </div>
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                            <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/30 to-red-500/30" />
                            <ArrowRight className="w-4 h-4 text-slate-700 shrink-0" />
                            <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/30 to-red-500/30" />
                        </div>
                        <div className="text-center">
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Exit Point</div>
                            <div className="font-mono text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg">
                                {ringData?.exit_point || "—"}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {Object.keys(ROLE_STYLE).map(role => (
                            <RoleTag key={role} role={role} accounts={ringData?.role_breakdown?.[role] || []} />
                        ))}
                    </div>
                </div>

                {/* Narrative */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Crime Narrative</span>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
                        <p className="text-xs text-slate-400 leading-relaxed">{ringData?.narrative || "No narrative available."}</p>
                    </div>
                </div>

                {/* Investigator Actions */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Lock className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Investigator Actions</span>
                    </div>
                    <div className="space-y-2">
                        {[
                            { urgency: "IMMEDIATE", label: "Freeze orchestrator accounts", icon: Lock, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                            { urgency: "URGENT", label: "Trace exit-point withdrawals", icon: Eye, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
                            { urgency: "HIGH", label: "Subpoena KYC records for entry point", icon: Shield, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
                            { urgency: "STANDARD", label: "Monitor all ring members for 90 days", icon: CheckCircle, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
                        ].map((a, i) => (
                            <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${a.bg}`}>
                                <a.icon className={`w-3.5 h-3.5 shrink-0 ${a.color}`} />
                                <div className="flex-1 min-w-0">
                                    <span className={`text-[8px] font-bold uppercase tracking-widest ${a.color}`}>{a.urgency}</span>
                                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{a.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main FraudChatbot Component ───────────────────────────────────────────────
export default function FraudChatbot({ ringData, allCrossRingPatterns, allData, onClose }) {
    const [messages, setMessages] = useState([]);
    const [streamingMsg, setStreamingMsg] = useState("");   // real-time SSE text
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("chat");
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingMsg]);
    useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

    const riskScore = ringData?.risk_score || 0;
    const riskColor = riskScore >= 90 ? "text-red-400" : riskScore >= 75 ? "text-amber-400" : "text-yellow-400";
    const fs = ringData?.summary || {};
    const suggestions = getSuggestions(ringData?.pattern_type);

    // Download chat transcript
    function downloadChat() {
        const blob = new Blob([JSON.stringify({
            ring_id: ringData?.ring_id,
            exported_at: new Date().toISOString(),
            messages: messages.map(m => ({ role: m.role, content: m.content })),
        }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chat_${ringData?.ring_id}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function downloadTxt() {
        const blob = new Blob([ringData?.ring_report || "No report available."], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${ringData?.ring_id}_report.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ── Send using geminiStream (SSE word-by-word) ────────────────────────────
    async function sendMessage(text) {
        if (!text.trim() || loading) return;
        setError(null);

        const userMsg = { role: "user", content: text };
        const history = [...messages, userMsg];

        setMessages(history);
        setInput("");
        setLoading(true);
        setStreamingMsg("");

        try {
            const systemPrompt = ringData?.system_prompt || "";

            // geminiStream fires onChunk as each SSE fragment arrives
            const full = await geminiStream(
                GEMINI_API_KEY,
                systemPrompt,
                history,
                (_fragment, accumulated) => {
                    setStreamingMsg(accumulated);          // update real-time preview
                }
            );

            // Stream complete — commit to messages, clear preview
            setMessages(prev => [...prev, { role: "assistant", content: full }]);
        } catch (err) {
            setError(err.message || "Could not reach Gemini API.");
        } finally {
            setLoading(false);
            setStreamingMsg("");
        }
    }

    return (
        <div className="flex flex-col h-full bg-[#0b0e1a] rounded-2xl border border-slate-800/50 overflow-hidden shadow-2xl shadow-black/50">

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="flex-none flex items-center justify-between px-5 py-3 bg-slate-900/70 border-b border-slate-800/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600/40 to-blue-600/20 flex items-center justify-center border border-violet-500/20">
                            <Bot className="w-4 h-4 text-violet-400" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-[#0b0e1a]" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white leading-tight">{ringData?.ring_id}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-bold ${riskColor}`}>Risk {riskScore}/100</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-[9px] text-slate-600 uppercase">{ringData?.pattern_type}</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-[9px] text-emerald-600">Gemini 2.5 Flash</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {TABS.map(({ id, icon: Icon, label }) => (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === id
                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/25"
                                    : "text-slate-600 border border-transparent hover:text-slate-400 hover:bg-slate-800/40"
                                }`}>
                            <Icon className="w-3 h-3" />
                            {label}
                        </button>
                    ))}
                    <button onClick={onClose}
                        className="ml-1 p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* ── Stats strip (chat tab only) ─────────────────────────────────────── */}
            {activeTab === "chat" && (
                <div className="flex-none grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-800/40 bg-slate-950/30">
                    {[
                        { label: "Laundered", icon: DollarSign, color: "text-red-400", val: `₹${fmt(fs.estimated_laundered)}` },
                        { label: "Transactions", icon: Activity, color: "text-blue-400", val: fs.num_transactions ?? "—" },
                        { label: "Duration", icon: Clock, color: "text-amber-400", val: fs.duration_hours != null ? `${fs.duration_hours}h` : "—" },
                    ].map(({ label, icon: Icon, color, val }) => (
                        <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                            <div>
                                <div className="text-[8px] uppercase tracking-widest text-slate-700 font-bold">{label}</div>
                                <div className={`text-[11px] font-bold ${color}`}>{val}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* ── CHAT TAB ── */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {activeTab === "chat" && (<>

                {/* Quick questions (empty state) */}
                {messages.length === 0 && (
                    <div className="flex-none px-5 pt-4 pb-3 border-b border-slate-800/30">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-2">Suggested Questions</p>
                        <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((q, i) => (
                                <button key={i} onClick={() => sendMessage(q)}
                                    className="text-[9px] bg-slate-900/60 hover:bg-violet-500/10 border border-slate-800 hover:border-violet-500/30 text-slate-600 hover:text-violet-300 rounded-lg px-2 py-1.5 transition-all leading-tight">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar min-h-0">

                    {/* Empty / welcome state */}
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-8">
                            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                                <Bot className="w-6 h-6 text-violet-500/40" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-600">Gemini Investigator</p>
                                <p className="text-xs text-slate-700 mt-0.5">Ask anything about {ringData?.ring_id}</p>
                            </div>
                        </div>
                    )}

                    {/* Committed messages */}
                    {messages.map((m, i) => (
                        <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            {m.role === "assistant" && (
                                <div className="w-6 h-6 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                    <Bot className="w-3 h-3 text-violet-400" />
                                </div>
                            )}
                            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user"
                                    ? "bg-violet-600/15 border border-violet-500/20 text-slate-200 rounded-tr-sm"
                                    : "bg-slate-900/70 border border-slate-800/50 text-slate-300 rounded-tl-sm"
                                }`}>{m.content}</div>
                            {m.role === "user" && (
                                <div className="w-6 h-6 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <User className="w-3 h-3 text-slate-500" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* ── Real-time streaming preview ─────────────────────────────── */}
                    {loading && streamingMsg && <StreamingBubble text={streamingMsg} />}

                    {/* Waiting for first chunk */}
                    {loading && !streamingMsg && <ThinkingDots />}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-900/20 border border-red-500/25 text-red-400 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input bar */}
                <div className="flex-none px-5 py-3 border-t border-slate-800/40 bg-slate-950/20">
                    <div className="flex items-center gap-2">
                        {messages.length > 0 && (
                            <button onClick={downloadChat}
                                className="flex-none p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/40 text-slate-600 hover:text-slate-400 transition-all">
                                <Download className="w-3 h-3" />
                            </button>
                        )}
                        <div className="flex-1 flex items-center bg-slate-900/50 border border-slate-800/50 rounded-2xl px-4 py-2 focus-within:border-violet-500/30 transition-colors gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                rows={1}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                                placeholder={`Ask about ${ringData?.ring_id}… (Enter to send)`}
                                className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-700 outline-none resize-none py-1"
                                style={{ minHeight: "20px", maxHeight: "80px" }}
                            />
                            <button onClick={() => sendMessage(input)}
                                disabled={loading || !input.trim()}
                                className="p-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-700 text-white rounded-xl transition-all shrink-0">
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </>)}

            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* ── REPORT TAB ── */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {activeTab === "report" && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <ReportView ringData={ringData} onDownloadTxt={downloadTxt} />
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* ── PATTERNS TAB ── */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {activeTab === "patterns" && (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar min-h-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-4">Cross-Ring Intelligence</p>
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

            {/* ════════════════════════════════════════════════════════════════════ */}
            {/* ── DOWNLOADS TAB ── */}
            {/* ════════════════════════════════════════════════════════════════════ */}
            {activeTab === "downloads" && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <DownloadManager
                        exportData={allData?.export}
                        fraudRings={allData?.fraud_rings}
                        suspiciousAccounts={allData?.suspicious_accounts}
                        crossRingPatterns={allData?.cross_ring_patterns}
                        summary={allData?.export?.full?.summary}
                    />
                </div>
            )}
        </div>
    );
}

import React, { useState } from "react";
import {
    Download, Check, Globe, Users, Network, FileText,
    TrendingDown, AlertTriangle, Shield, Clock
} from "lucide-react";

// ── Download utility ──────────────────────────────────────────────────────────
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ts() {
    return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

const SEVERITY_STYLES = {
    CRITICAL: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25" },
    HIGH: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/25" },
    MEDIUM: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25" },
    LOW: { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/25" },
};

const URGENCY_STYLES = {
    IMMEDIATE: "text-red-400",
    URGENT: "text-amber-400",
    HIGH: "text-yellow-400",
    MEDIUM: "text-blue-400",
    STANDARD: "text-slate-400",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }) {
    return (
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-widest font-bold text-slate-600">{label}</span>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <div className={`text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
        </div>
    );
}

// ── Bulk Download Button ──────────────────────────────────────────────────────
function BulkBtn({ label, desc, loading, loadingKey, myKey, onClick, icon: Icon, accent }) {
    const isLoading = loading === myKey;
    const isDisabled = loading !== null;
    return (
        <button onClick={onClick} disabled={isDisabled}
            className={`flex flex-col gap-1.5 p-4 rounded-xl border transition-all text-left group ${isLoading
                ? "bg-violet-500/20 border-violet-500/40"
                : `${accent} hover:border-opacity-60 hover:brightness-110`
                } ${isDisabled && !isLoading ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-2">
                {isLoading
                    ? <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                    : <Icon className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />}
                <span className={`text-xs font-bold ${isLoading ? "text-violet-300" : "text-slate-300 group-hover:text-white"} transition-colors`}>
                    {isLoading ? "Preparing…" : label}
                </span>
            </div>
            <span className="text-[9px] text-slate-600">{desc}</span>
        </button>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DownloadManager({ exportData, fraudRings, suspiciousAccounts, crossRingPatterns, summary }) {
    const [loading, setLoading] = useState(null);
    const [history, setHistory] = useState([]);

    const stamp = (label) => setHistory(prev => [
        { label, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        ...prev.slice(0, 5)
    ]);

    async function handle(type, ringId = null) {
        setLoading(type);
        await new Promise(r => setTimeout(r, 350));
        const t = ts();

        try {
            if (type === "full") {
                // Try backend endpoint first, fall back to in-memory
                if (exportData?.full) {
                    downloadJSON(exportData.full, `full_network_report_${t}.json`);
                } else {
                    const res = await fetch("http://localhost:8000/export/full");
                    downloadJSON(await res.json(), `full_network_report_${t}.json`);
                }
                stamp("Full Network Report");
            }

            if (type === "accounts") {
                if (exportData?.accounts) {
                    downloadJSON(exportData.accounts, `suspicious_accounts_${t}.json`);
                } else {
                    const payload = {
                        report_type: "SUSPICIOUS_ACCOUNTS",
                        generated_at: new Date().toISOString(),
                        total_flagged: suspiciousAccounts?.length ?? 0,
                        sorted_by: "suspicion_score_descending",
                        accounts: [...(suspiciousAccounts ?? [])].sort((a, b) => b.suspicion_score - a.suspicion_score),
                    };
                    downloadJSON(payload, `suspicious_accounts_${t}.json`);
                }
                stamp("Suspicious Accounts");
            }

            if (type === "patterns") {
                if (exportData?.patterns) {
                    downloadJSON(exportData.patterns, `cross_ring_patterns_${t}.json`);
                } else {
                    const payload = {
                        report_type: "CROSS_RING_PATTERNS",
                        generated_at: new Date().toISOString(),
                        patterns_found: crossRingPatterns?.length ?? 0,
                        patterns: crossRingPatterns ?? [],
                        ring_summary: (fraudRings ?? []).map(r => ({
                            ring_id: r.ring_id,
                            pattern_type: r.pattern_type,
                            risk_score: r.risk_score,
                            laundered: r.financial?.estimated_laundered ?? 0,
                        })),
                    };
                    downloadJSON(payload, `cross_ring_patterns_${t}.json`);
                }
                stamp("Cross-Ring Patterns");
            }

            if (type === "ring" && ringId) {
                if (exportData?.rings?.[ringId]) {
                    downloadJSON(exportData.rings[ringId], `ring_report_${ringId}_${t}.json`);
                } else {
                    const res = await fetch(`http://localhost:8000/export/ring/${ringId}`);
                    downloadJSON(await res.json(), `ring_report_${ringId}_${t}.json`);
                }
                stamp(`Ring: ${ringId}`);
            }

            if (type === "all_rings") {
                const rings = exportData?.rings ? Object.entries(exportData.rings)
                    : (fraudRings ?? []).map(r => [r.ring_id, { report_type: "RING_REPORT", ...r }]);
                rings.forEach(([id, data], i) => {
                    setTimeout(() => {
                        downloadJSON(data, `ring_report_${id}_${t}.json`);
                    }, i * 400);
                });
                stamp(`All Ring Reports (${rings.length} files)`);
            }
        } catch (err) {
            console.error("Download error:", err);
        } finally {
            setLoading(null);
        }
    }

    const totalLaundered = summary?.total_estimated_laundered
        ?? (fraudRings ?? []).reduce((s, r) => s + (r.financial?.estimated_laundered ?? r.risk_score ?? 0), 0);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#0b0e1a]">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-6">

                {/* Summary Stats */}
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">Network Overview</p>
                    <div className="grid grid-cols-2 gap-2">
                        <StatCard label="Rings Detected" icon={Network} color="text-red-400" value={fraudRings?.length ?? 0} />
                        <StatCard label="Accounts Flagged" icon={Users} color="text-amber-400" value={suspiciousAccounts?.length ?? 0} />
                        <StatCard label="Patterns Found" icon={AlertTriangle} color="text-yellow-400" value={crossRingPatterns?.length ?? 0} />
                        <StatCard label="Money detected in Muling" icon={TrendingDown} color="text-emerald-400"
                            value={`₹${Number(totalLaundered || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
                    </div>
                </div>

                {/* Bulk Exports */}
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">Bulk Exports</p>
                    <div className="grid grid-cols-2 gap-2">
                        <BulkBtn label="Full Network Report" desc="Everything in one file"
                            icon={Globe} myKey="full" loading={loading}
                            accent="bg-emerald-500/8 border-emerald-500/20"
                            onClick={() => handle("full")} />
                        <BulkBtn label="Suspicious Accounts" desc="Flat list, sorted by score"
                            icon={Users} myKey="accounts" loading={loading}
                            accent="bg-blue-500/8 border-blue-500/20"
                            onClick={() => handle("accounts")} />
                        <BulkBtn label="Cross-Ring Patterns" desc="Network-wide analysis"
                            icon={Network} myKey="patterns" loading={loading}
                            accent="bg-amber-500/8 border-amber-500/20"
                            onClick={() => handle("patterns")} />
                        <BulkBtn label="All Ring Reports" desc={`${fraudRings?.length ?? 0} files`}
                            icon={FileText} myKey="all_rings" loading={loading}
                            accent="bg-violet-500/8 border-violet-500/20"
                            onClick={() => handle("all_rings")} />
                    </div>
                </div>

                {/* Per-Ring Exports */}
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">Per-Ring Exports</p>
                    <div className="space-y-2">
                        {[...(fraudRings ?? [])].sort((a, b) => b.risk_score - a.risk_score).map(ring => {
                            const rs = ring.risk_score ?? 0;
                            const rColor = rs >= 80 ? "text-red-400" : rs >= 60 ? "text-amber-400" : "text-yellow-400";
                            const rBg = rs >= 80 ? "bg-red-500/10 border-red-500/20" : rs >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-yellow-500/10 border-yellow-500/20";
                            const laundered = ring.financial?.estimated_laundered ?? 0;
                            return (
                                <div key={ring.ring_id}
                                    className="flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-xl px-4 py-3 hover:bg-slate-900/80 transition-all group">
                                    {/* Risk badge */}
                                    <div className={`flex-none px-2 py-1 rounded-lg text-[10px] font-extrabold border tabular-nums ${rBg} ${rColor}`}>
                                        {rs.toFixed(0)}
                                    </div>
                                    {/* Ring info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[11px] font-bold text-slate-200">{ring.ring_id}</span>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 font-bold uppercase">
                                                {ring.pattern_type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-[9px] text-slate-600">{ring.member_accounts?.length ?? 0} accounts</span>
                                            {laundered > 0 && (
                                                <span className="text-[9px] text-slate-600">
                                                    ₹{Number(laundered).toLocaleString("en-IN", { maximumFractionDigits: 0 })} detected in Muling
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Download button */}
                                    <button
                                        onClick={() => handle("ring", ring.ring_id)}
                                        disabled={loading !== null}
                                        className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest
                      bg-slate-800/60 hover:bg-violet-500/20 border border-slate-700/50 hover:border-violet-500/30
                      text-slate-500 hover:text-violet-300 transition-all disabled:opacity-30">
                                        {loading === "ring" ? (
                                            <div className="w-3 h-3 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                                        ) : (
                                            <Download className="w-3 h-3" />
                                        )}
                                        JSON
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Cross-Ring Patterns Preview */}
                {(crossRingPatterns?.length ?? 0) > 0 && (
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">Patterns Preview</p>
                        <div className="space-y-2">
                            {crossRingPatterns.map((p, i) => {
                                const s = SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.MEDIUM;
                                return (
                                    <div key={i} className={`p-3.5 rounded-xl border ${s.bg} ${s.border}`}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${s.bg} ${s.border} ${s.text}`}>
                                                {p.severity}
                                            </span>
                                            <span className={`text-[11px] font-bold ${s.text}`}>
                                                {(p.pattern_name || "").replace(/_/g, " ")}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-relaxed">{p.description}</p>
                                        {p.implication && (
                                            <p className="text-[9px] text-slate-700 italic mt-1.5">→ {p.implication}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Download History */}
                {history.length > 0 && (
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">Recent Downloads</p>
                        <div className="space-y-1.5">
                            {history.map((h, i) => (
                                <div key={i} className="flex items-center gap-2.5 text-[10px]">
                                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="text-slate-500 flex-1">{h.label}</span>
                                    <span className="text-slate-700 flex-none">{h.time}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

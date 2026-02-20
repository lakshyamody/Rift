import React, { useState } from "react";
import GraphVisualization from "./components/GraphVisualization";
import FraudChatbot from "./components/FraudChatbot";
import {
  AlertCircle, CheckCircle2, Search, Filter, ShieldAlert,
  MessageSquare, Download, Table2
} from "lucide-react";


const RISK_COLOR = (score) =>
  score >= 90 ? "text-red-400" : score >= 75 ? "text-orange-400" : "text-yellow-400";

// ─── Ring Summary Table ────────────────────────────────────────────────────────
function RingSummaryTable({ rings }) {
  if (!rings?.length) return null;
  return (
    <div className="overflow-x-auto overflow-y-auto custom-scrollbar h-full">
      <table className="w-full text-xs min-w-[640px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
            {["Ring ID", "Pattern Type", "Members", "Risk Score", "Member Accounts"].map(h => (
              <th key={h} className="px-4 py-3 text-left font-bold text-[9px] uppercase tracking-widest text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rings.map((ring, i) => (
            <tr key={ring.ring_id}
              className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors ${i % 2 === 0 ? "" : "bg-slate-900/20"}`}>
              <td className="px-4 py-3 font-mono font-bold text-slate-300 whitespace-nowrap">{ring.ring_id}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase text-[9px] border border-violet-500/20">
                  {ring.pattern_type}
                </span>
              </td>
              <td className="px-4 py-3 font-bold text-center text-slate-300">{ring.member_accounts?.length || 0}</td>
              <td className={`px-4 py-3 font-bold tabular-nums ${RISK_COLOR(ring.risk_score)}`}>
                {ring.risk_score?.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-xs">
                <div className="truncate text-[10px]" title={ring.member_accounts?.join(", ")}>
                  {ring.member_accounts?.join(", ")}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeRingId, setActiveRingId] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [showTable, setShowTable] = useState(false);

  React.useEffect(() => { loadSampleData(); }, []);

  const loadSampleData = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("http://localhost:8000/sample");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Animation engine
  React.useEffect(() => {
    let t;
    if (isPlaying && activeRingId && data) {
      const ring = data.fraud_rings.find(r => r.ring_id === activeRingId);
      if (ring?.reconstruction) {
        t = setInterval(() => {
          setCurrentFrame(p => {
            if (p >= ring.reconstruction.timeline.length - 1) { setIsPlaying(false); return p; }
            return p + 1;
          });
        }, 1500);
      }
    }
    return () => clearInterval(t);
  }, [isPlaying, activeRingId, data]);

  const startReconstruction = (id) => { setActiveRingId(id); setCurrentFrame(0); setIsPlaying(true); setShowChatbot(false); setShowTable(false); };
  const openChatbot = (id) => { setActiveRingId(id); setShowChatbot(true); setIsPlaying(false); setCurrentFrame(-1); setShowTable(false); };
  const closeChatbot = () => setShowChatbot(false);
  const stopAll = () => { setActiveRingId(null); setCurrentFrame(-1); setIsPlaying(false); setShowChatbot(false); };

  const activeRing = data?.fraud_rings?.find(r => r.ring_id === activeRingId);
  const activeChatbotRing = data?.chatbot_payload?.rings?.find(r => r.ring_id === activeRingId);

  // Status badge
  const badge = showChatbot
    ? { label: "Gemini Active", cls: "bg-emerald-900/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" }
    : showTable
      ? { label: "Table View", cls: "bg-blue-900/20 text-blue-400 border-blue-500/30", dot: "bg-blue-400" }
      : activeRingId
        ? { label: "Reconstruction", cls: "bg-red-900/20 text-red-400 border-red-500/30", dot: "bg-red-400" }
        : { label: "3D Spatial Engine", cls: "bg-violet-900/20 text-violet-400 border-violet-500/30", dot: "bg-violet-400" };

  const mainTitle = showChatbot
    ? `AI Analyst — ${activeRingId}`
    : showTable ? "Fraud Ring Summary"
      : activeRingId ? `Reconstruction: ${activeRingId}`
        : "Transactions Visualization";

  return (
    // Root: locked to full viewport, no overflow
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#080c16] text-slate-50 font-sans">

      {/* ── Header ── */}
      <header className="flex-none border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-md px-6 py-3.5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">Nacht <span className="text-violet-400">Detect</span></h1>
            <p className="text-[10px] text-slate-500 font-medium">Graph Neural Network Fraud Detection</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => { setShowTable(v => !v); setShowChatbot(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${showTable ? "bg-blue-900/20 text-blue-400 border-blue-500/25" : "bg-slate-800/60 text-slate-500 border-slate-700/50 hover:text-slate-300"}`}>
            <Table2 className="w-3 h-3" /> Ring Table
          </button>
          {activeRingId && (<>
            <button onClick={() => setShowChatbot(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${showChatbot ? "bg-violet-900/20 text-violet-400 border-violet-500/25" : "bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200"}`}>
              <MessageSquare className="w-3 h-3" /> {showChatbot ? "Hide Analyst" : "AI Analyst"}
            </button>
            <button onClick={stopAll}
              className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-slate-800/60 text-slate-500 border border-slate-700/50 hover:text-slate-200 transition-all">
              Exit Ring
            </button>
          </>)}
          <button onClick={loadSampleData} disabled={loading}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${loading ? "bg-slate-700 text-slate-500" : "bg-violet-700 hover:bg-violet-600 text-white shadow-md shadow-violet-700/20 active:scale-95"}`}>
            {loading ? "Analyzing…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* ── Body: flex-1 with overflow hidden ── */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4 min-h-0">

        {/* ── Left Sidebar (fixed width, internal scroll) ── */}
        <aside className="w-72 flex-none flex flex-col gap-4 overflow-hidden">

          {/* Error */}
          {error && (
            <div className="flex-none bg-red-900/20 border border-red-500/25 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Summary Stats — fixed, not scrollable */}
          <div className="flex-none bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Analysis Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Analyzed", value: data?.summary?.total_accounts_analyzed || 0, color: "text-slate-200" },
                { label: "Flagged", value: data?.summary?.suspicious_accounts_flagged || 0, color: "text-red-400" },
                { label: "Rings", value: data?.summary?.fraud_rings_detected || 0, color: "text-violet-400" },
                { label: "Latency", value: `${data?.summary?.processing_time_seconds || 0}s`, color: "text-slate-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/40 px-3 py-2.5 rounded-xl border border-slate-700/30">
                  <div className="text-[8px] text-slate-600 uppercase font-bold tracking-wider mb-0.5">{label}</div>
                  <div className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fraud Rings — this section fills remaining space and scrolls internally */}
          <div className="flex-1 min-h-0 bg-slate-900/60 border border-slate-800/60 rounded-2xl flex flex-col overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fraud Rings</span>
              <span className="ml-auto text-[9px] font-bold text-slate-700">
                {data?.fraud_rings?.length || 0} detected
              </span>
            </div>

            {/* The scrollable list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5 min-h-0">
              {data?.fraud_rings?.length > 0 ? data.fraud_rings.map(ring => (
                <div key={ring.ring_id}
                  className={`rounded-xl border p-3 transition-all ${activeRingId === ring.ring_id
                    ? "bg-violet-500/8 border-violet-500/30 shadow-sm shadow-violet-500/10"
                    : "bg-slate-800/25 border-slate-700/40 hover:bg-slate-800/50 hover:border-slate-700/60"
                    }`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[10px] font-bold text-slate-200 leading-tight">{ring.ring_id}</span>
                    <span className="flex-none text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase border border-violet-500/20">
                      {ring.pattern_type}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-600 leading-relaxed mb-2.5 line-clamp-2">
                    {ring.narrative || `${ring.member_accounts?.length} accounts detected.`}
                  </p>
                  <div className="flex gap-1.5">
                    <button onClick={() => startReconstruction(ring.ring_id)}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all ${activeRingId === ring.ring_id && isPlaying
                        ? "bg-violet-600 text-white"
                        : "bg-slate-700/60 hover:bg-violet-700 text-slate-500 hover:text-white"
                        }`}>
                      {activeRingId === ring.ring_id && isPlaying ? "● Playing" : "▶ Replay"}
                    </button>
                    <button onClick={() => openChatbot(ring.ring_id)}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeRingId === ring.ring_id && showChatbot
                        ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                        : "bg-slate-700/60 hover:bg-slate-700 text-slate-500 hover:text-white"
                        }`}>
                      <MessageSquare className="w-2 h-2" /> Analyze
                    </button>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 py-10 text-slate-700">
                  <Search className="w-8 h-8 opacity-20" />
                  <p className="text-[10px]">No rings detected</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Content (fills remaining space) ── */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 min-w-0">

          {/* Title bar */}
          <div className="flex-none flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">{mainTitle}</h2>
            <span className={`text-[10px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${badge.cls}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${badge.dot}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${badge.dot}`} />
              </span>
              {badge.label}
            </span>
          </div>

          {/* Ring Summary Table — own scrollable box, fixed height */}
          {showTable && (
            <div className="flex-none h-56 bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <RingSummaryTable rings={data?.fraud_rings || []} />
            </div>
          )}

          {/* Graph / Chatbot — always fills remaining space */}
          <div className="flex-1 min-h-0 rounded-2xl overflow-hidden">
            {showChatbot && activeChatbotRing ? (
              <div className="h-full">
                <FraudChatbot
                  key={activeChatbotRing.ring_id}
                  ringData={activeChatbotRing}
                  allCrossRingPatterns={data?.cross_ring_patterns || []}
                  allData={data}
                  onClose={closeChatbot}
                />
              </div>
            ) : (
              <GraphVisualization
                data={data?.graph_data}
                activeReconstruction={activeRing?.reconstruction}
                currentFrame={currentFrame}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="flex-none px-6 py-2.5 border-t border-slate-800/40 text-[9px] text-slate-700 flex justify-between items-center font-bold uppercase tracking-widest bg-slate-900/20">
        <div>Nacht Detect · Operational</div>
        <div>GCN-Layer2 + Gemini-2.0-Flash</div>
        <div>Latency: {data?.summary?.processing_time_seconds || 0}s</div>
      </footer>
    </div>
  );
}

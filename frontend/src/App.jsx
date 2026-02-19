import React, { useState } from "react";
import GraphVisualization from "./components/GraphVisualization";
import FraudChatbot from "./components/FraudChatbot";
import {
  AlertCircle, CheckCircle2, Search, Filter, ShieldAlert,
  MessageSquare, Download, Table2
} from "lucide-react";

const GEMINI_API_KEY = "AIzaSyAzerISaRYQV6H8xzq2f2K2ZB_M0k7yRBQ";

// Pre-fill API key into localStorage so the chatbot picks it up automatically
if (!localStorage.getItem("gemini_api_key")) {
  localStorage.setItem("gemini_api_key", GEMINI_API_KEY);
}

const RISK_COLOR = (score) => {
  if (score >= 90) return "text-red-400";
  if (score >= 75) return "text-orange-400";
  return "text-yellow-400";
};

function RingSummaryTable({ rings }) {
  if (!rings || rings.length === 0) return null;
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Fraud Ring Summary Table</span>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
          {rings.length} rings detected
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              {["Ring ID", "Pattern Type", "Members", "Risk Score", "Member Accounts"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-bold text-[9px] uppercase tracking-widest text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rings.map((ring, i) => (
              <tr
                key={ring.ring_id}
                className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? "bg-transparent" : "bg-slate-900/20"
                  }`}
              >
                <td className="px-4 py-3 font-mono font-bold text-slate-300 whitespace-nowrap">
                  {ring.ring_id}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold uppercase text-[9px]">
                    {ring.pattern_type}
                  </span>
                </td>
                <td className="px-4 py-3 font-bold text-slate-300 text-center">
                  {ring.member_accounts?.length || 0}
                </td>
                <td className={`px-4 py-3 font-bold tabular-nums ${RISK_COLOR(ring.risk_score)}`}>
                  {ring.risk_score?.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-slate-500 max-w-xs">
                  <div className="truncate" title={ring.member_accounts?.join(", ")}>
                    {ring.member_accounts?.join(", ")}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
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
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:8000/sample");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Animation engine
  React.useEffect(() => {
    let interval;
    if (isPlaying && activeRingId && data) {
      const ring = data.fraud_rings.find(r => r.ring_id === activeRingId);
      if (ring?.reconstruction) {
        interval = setInterval(() => {
          setCurrentFrame(prev => {
            if (prev >= ring.reconstruction.timeline.length - 1) {
              setIsPlaying(false);
              return prev;
            }
            return prev + 1;
          });
        }, 1500);
      }
    }
    return () => clearInterval(interval);
  }, [isPlaying, activeRingId, data]);

  const startReconstruction = (ringId) => {
    setActiveRingId(ringId);
    setCurrentFrame(0);
    setIsPlaying(true);
    setShowChatbot(false);
    setShowTable(false);
  };

  const openChatbot = (ringId) => {
    setActiveRingId(ringId);
    setShowChatbot(true);
    setIsPlaying(false);
    setCurrentFrame(-1);
    setShowTable(false);
  };

  const closeChatbot = () => setShowChatbot(false);

  const stopReconstruction = () => {
    setActiveRingId(null);
    setCurrentFrame(-1);
    setIsPlaying(false);
    setShowChatbot(false);
  };

  const downloadReport = async () => {
    try {
      const response = await fetch("http://localhost:8000/report.json");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fraud_report.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download report: " + err.message);
    }
  };

  const activeRing = data?.fraud_rings?.find(r => r.ring_id === activeRingId);
  const activeChatbotRing = data?.chatbot_payload?.rings?.find(r => r.ring_id === activeRingId);

  const mainLabel = showChatbot
    ? `AI Analyst — ${activeRingId}`
    : showTable
      ? "Fraud Ring Summary Table"
      : activeRingId
        ? `Crime Reconstruction: ${activeRingId}`
        : "Network Visualization";

  const statusLabel = showChatbot ? "Gemini Active" : showTable ? "Summary View" : activeRingId ? "Narrative Playback" : "3D Spatial Engine";
  const statusColor = showChatbot ? "bg-emerald-900/20 text-emerald-400 border-emerald-600/30" : showTable ? "bg-blue-900/20 text-blue-400 border-blue-600/30" : activeRingId ? "bg-danger/10 text-danger border-danger/20" : "bg-primary/10 text-primary border-primary/20";
  const dotColor = showChatbot ? "bg-emerald-400" : showTable ? "bg-blue-400" : activeRingId ? "bg-danger" : "bg-primary";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Rift <span className="text-primary">GNN</span></h1>
            <p className="text-xs text-slate-400 font-medium">Graph Neural Network Fraud Detection</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* JSON Download */}
          <button
            onClick={downloadReport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border bg-emerald-900/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-900/40 transition-all uppercase tracking-widest"
          >
            <Download className="w-3.5 h-3.5" />
            Download JSON
          </button>

          {/* Ring Table Toggle */}
          <button
            onClick={() => { setShowTable(v => !v); setShowChatbot(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all uppercase tracking-widest ${showTable ? "bg-blue-900/20 text-blue-400 border-blue-600/30" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
              }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            Ring Table
          </button>

          {activeRingId && (
            <>
              <button
                onClick={() => setShowChatbot(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all uppercase tracking-widest ${showChatbot ? "bg-primary/20 text-primary border-primary/30" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {showChatbot ? "Hide Analyst" : "AI Analyst"}
              </button>
              <button
                onClick={stopReconstruction}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all uppercase tracking-widest"
              >
                Exit Ring
              </button>
            </>
          )}
          <button
            onClick={loadSampleData}
            disabled={loading}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${loading ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/20 active:scale-95"
              }`}
          >
            {loading ? "Re-Analyzing..." : "Refresh Analysis"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto flex flex-col gap-6">
        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-3 flex flex-col space-y-4 overflow-hidden">
            {/* Summary */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Analysis Summary
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Analyzed", value: data?.summary?.total_accounts_analyzed || 0, color: "text-white" },
                  { label: "Flagged", value: data?.summary?.suspicious_accounts_flagged || 0, color: "text-danger" },
                  { label: "Rings", value: data?.summary?.fraud_rings_detected || 0, color: "text-primary" },
                  { label: "Latency", value: `${data?.summary?.processing_time_seconds || 0}s`, color: "text-slate-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{label}</div>
                    <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fraud Rings */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col overflow-hidden">
              <h2 className="text-sm font-bold flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-primary" />
                Fraud Rings
              </h2>
              <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                {data?.fraud_rings?.length > 0 ? (
                  data.fraud_rings.map((ring) => (
                    <div
                      key={ring.ring_id}
                      className={`p-3.5 rounded-xl border transition-all group ${activeRingId === ring.ring_id
                          ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                          : "bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/60"
                        }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="font-mono text-[10px] font-bold text-slate-300 uppercase">{ring.ring_id}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold uppercase">{ring.pattern_type}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2.5 leading-relaxed line-clamp-2">
                        {ring.narrative || `Network with ${ring.member_accounts?.length} accounts.`}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => startReconstruction(ring.ring_id)}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeRingId === ring.ring_id && isPlaying ? "bg-primary text-white" : "bg-slate-700 hover:bg-primary text-slate-400 hover:text-white"
                            }`}
                        >
                          {activeRingId === ring.ring_id && isPlaying ? "Playing..." : "▶ Replay"}
                        </button>
                        <button
                          onClick={() => openChatbot(ring.ring_id)}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeRingId === ring.ring_id && showChatbot ? "bg-primary/30 text-primary border border-primary/40" : "bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white"
                            }`}
                        >
                          <MessageSquare className="w-2.5 h-2.5" />
                          Analyze
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                    <Search className="w-10 h-10 opacity-20" />
                    <p className="text-xs font-medium">No rings detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Area */}
          <div className="col-span-12 lg:col-span-9 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{mainLabel}</h2>
              <span className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-full border ${statusColor}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
                </span>
                {statusLabel}
              </span>
            </div>

            {/* Ring Summary Table */}
            {showTable && (
              <RingSummaryTable rings={data?.fraud_rings || []} />
            )}

            {/* Graph / Chatbot */}
            <div className={`flex-1 min-h-[480px] ${showTable ? "hidden lg:flex flex-col" : ""}`}>
              {showChatbot && activeChatbotRing ? (
                <FraudChatbot
                  ringData={activeChatbotRing}
                  allCrossRingPatterns={data?.cross_ring_patterns || []}
                  onClose={closeChatbot}
                />
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
      </main>

      <footer className="px-8 py-3 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between items-center font-bold uppercase tracking-widest bg-slate-900/20">
        <div>System Status: Operational</div>
        <div>Model: GCN-Layer2 + Gemini-2.0-Flash</div>
        <div>Latency: {data?.summary?.processing_time_seconds || 0}s</div>
      </footer>
    </div>
  );
}

export default App;

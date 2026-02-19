import React, { useState } from "react";
import GraphVisualization from "./components/GraphVisualization";
import FraudChatbot from "./components/FraudChatbot";
import { AlertCircle, CheckCircle2, Search, Filter, ShieldAlert, MessageSquare } from "lucide-react";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [activeRingId, setActiveRingId] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  React.useEffect(() => {
    loadSampleData();
  }, []);

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

  // Animation Engine for Reconstruction
  React.useEffect(() => {
    let interval;
    if (isPlaying && activeRingId) {
      const ring = data.fraud_rings.find(r => r.ring_id === activeRingId);
      if (ring && ring.reconstruction) {
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
    setShowChatbot(false); // Switch to graph view during playback
  };

  const stopReconstruction = () => {
    setActiveRingId(null);
    setCurrentFrame(-1);
    setIsPlaying(false);
  };

  const openChatbot = (ringId) => {
    setActiveRingId(ringId);
    setShowChatbot(true);
    // Stop playback when opening chatbot
    setIsPlaying(false);
    setCurrentFrame(-1);
  };

  const closeChatbot = () => {
    setShowChatbot(false);
  };

  const activeRing = data?.fraud_rings?.find(r => r.ring_id === activeRingId);
  const activeChatbotRing = data?.chatbot_payload?.rings?.find(r => r.ring_id === activeRingId);

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

        <div className="flex items-center space-x-4">
          {activeRingId && (
            <>
              <button
                onClick={() => setShowChatbot(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all uppercase tracking-widest ${showChatbot
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {showChatbot ? "Hide Analyst" : "AI Analyst"}
              </button>
              <button
                onClick={stopReconstruction}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all uppercase tracking-widest"
              >
                Exit Ring
              </button>
            </>
          )}
          <button
            onClick={loadSampleData}
            disabled={loading}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${loading
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/20 active:scale-95"
              }`}
          >
            {loading ? "Re-Analyzing..." : "Refresh Analysis"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-hidden flex flex-col space-y-8">
        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-xl flex items-center space-x-3">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-3 flex flex-col space-y-5 overflow-hidden">
            {/* Summary */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
              <h2 className="text-sm font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Analysis Summary</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Analyzed</span>
                  <div className="text-xl font-bold mt-1">{data?.summary?.total_accounts_analyzed || 0}</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Flagged</span>
                  <div className="text-xl font-bold text-danger mt-1">{data?.summary?.suspicious_accounts_flagged || 0}</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 col-span-2">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Rings Detected</span>
                  <div className="text-xl font-bold text-primary mt-1">{data?.summary?.fraud_rings_detected || 0}</div>
                </div>
              </div>
            </div>

            {/* Fraud Rings Panel */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4 overflow-hidden">
              <h2 className="text-sm font-bold flex items-center space-x-2">
                <Filter className="w-4 h-4 text-primary" />
                <span>Fraud Rings</span>
              </h2>
              <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                {data?.fraud_rings?.length > 0 ? (
                  data.fraud_rings.map((ring) => (
                    <div
                      key={ring.ring_id}
                      className={`p-4 rounded-xl border transition-all group ${activeRingId === ring.ring_id
                          ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                          : "bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/60"
                        }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono text-[11px] font-bold text-slate-300 group-hover:text-white uppercase">
                          {ring.ring_id}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold uppercase">
                          {ring.pattern_type}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-3 leading-relaxed line-clamp-2">
                        {ring.narrative || `Laundering network with ${ring.member_accounts.length} accounts.`}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startReconstruction(ring.ring_id)}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeRingId === ring.ring_id && isPlaying
                              ? "bg-primary text-white"
                              : "bg-slate-700 hover:bg-primary text-slate-400 hover:text-white"
                            }`}
                        >
                          {activeRingId === ring.ring_id && isPlaying ? "Playing..." : "▶ Replay"}
                        </button>
                        <button
                          onClick={() => openChatbot(ring.ring_id)}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeRingId === ring.ring_id && showChatbot
                              ? "bg-primary/30 text-primary border border-primary/40"
                              : "bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white"
                            }`}
                        >
                          <MessageSquare className="w-2.5 h-2.5" />
                          Analyze
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                    <Search className="w-10 h-10 opacity-20" />
                    <p className="text-xs font-medium">No rings detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-12 lg:col-span-9 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {showChatbot
                  ? `AI Analyst — ${activeRingId}`
                  : activeRingId
                    ? `Crime Reconstruction: ${activeRingId}`
                    : "Network Visualization"}
              </h2>
              <span className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-full border ${showChatbot
                  ? "bg-emerald-900/20 text-emerald-400 border-emerald-600/30"
                  : activeRingId
                    ? "bg-danger/10 text-danger border-danger/20"
                    : "bg-primary/10 text-primary border-primary/20"
                }`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${showChatbot ? "bg-emerald-400" : activeRingId ? "bg-danger" : "bg-primary"
                    }`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${showChatbot ? "bg-emerald-400" : activeRingId ? "bg-danger" : "bg-primary"
                    }`} />
                </span>
                {showChatbot ? "Gemini Active" : activeRingId ? "Narrative Playback" : "3D Spatial Engine"}
              </span>
            </div>

            <div className="flex-1 min-h-[520px]">
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

      {/* Footer */}
      <footer className="px-8 py-3 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between items-center font-bold uppercase tracking-widest bg-slate-900/20">
        <div>System Status: Operational</div>
        <div>Model: GCN-Layer2 + Gemini-2.0-Flash</div>
        <div>Latency: {data?.summary?.processing_time_seconds || 0}s</div>
      </footer>
    </div>
  );
}

export default App;

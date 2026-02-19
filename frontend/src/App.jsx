import React, { useState } from "react";
import GraphVisualization from "./components/GraphVisualization";
import { AlertCircle, CheckCircle2, Search, Filter, ShieldAlert } from "lucide-react";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    loadSampleData();
  }, []);

  const loadSampleData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:8000/sample");
      if (!response.ok) throw new Error("Failed to load sample data");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          <button
            onClick={loadSampleData}
            disabled={loading}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${loading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/20 active:scale-95'
              }`}
          >
            {loading ? "Re-Analyzing..." : "Refresh Sample Analysis"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-hidden flex flex-col space-y-8">
        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
          {/* Sidebar - Results */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col space-y-6 overflow-hidden">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col space-y-4">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span>Summary</span>
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Analyzed</span>
                  <div className="text-2xl font-bold">{data?.summary?.total_accounts_analyzed || 0}</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Flagged</span>
                  <div className="text-2xl font-bold text-danger">{data?.summary?.suspicious_accounts_flagged || 0}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col space-y-4 overflow-hidden">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-danger" />
                <span>Suspicious Entities</span>
              </h2>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {data?.suspicious_accounts?.length > 0 ? (
                  data.suspicious_accounts.map((acc) => (
                    <div key={acc.account_id} className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/60 transition-colors cursor-pointer group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-sm font-bold text-slate-300 group-hover:text-white">{acc.account_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${acc.suspicion_score > 90 ? 'bg-danger/20 text-danger' : 'bg-orange-500/20 text-orange-400'
                          }`}>
                          {Math.round(acc.suspicion_score)}% Risk
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {acc.detected_patterns.map((p, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-tight">
                            {p.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                    <Search className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">No alerts detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content - Graph */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Network Visualization</h2>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-primary flex items-center space-x-1 uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                  <span className="relative flex h-2 w-2 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span>3D Spatial Engine</span>
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-[500px]">
              <GraphVisualization data={data?.graph_data} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-3 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between items-center font-bold uppercase tracking-widest bg-slate-900/20">
        <div>System Status: Operational</div>
        <div>Model: GCN-Layer2-Structural-v1.0.4</div>
        <div>Engine Latency: {data?.summary?.processing_time_seconds || 0}s</div>
      </footer>
    </div>
  );
}

export default App;

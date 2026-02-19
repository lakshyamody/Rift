import React, { useRef, useEffect, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

const ROLE_COLORS = {
    'ORCHESTRATOR': '#ff0000',   // Pure Red
    'COLLECTOR': '#f97316',      // Orange
    'SHELL': '#fbbf24',         // Amber/Gold
    'MULE': '#eab308',          // Yellow
    'EXIT_POINT': '#7f1d1d',    // Dark Red
    'RECRUITER': '#db2777',     // Pink/Magenta
    'UNKNOWN': '#94a3b8'        // Slate
};

const GraphVisualization = ({ data, activeReconstruction = null, currentFrame = -1 }) => {
    const fgRef = useRef();

    // Memoize graph data for force-graph
    const graphData = useMemo(() => {
        if (!data) return { nodes: [], links: [] };

        const isReconstructing = activeReconstruction !== null && currentFrame >= 0;
        const currentTx = isReconstructing ? activeReconstruction.timeline[currentFrame] : null;

        return {
            nodes: data.nodes.map(node => {
                let color = node.color;
                let size = node.size || 5;

                if (isReconstructing) {
                    const role = node.role || 'UNKNOWN';
                    color = ROLE_COLORS[role] || ROLE_COLORS.UNKNOWN;

                    // Highlight sender/receiver of current frame
                    if (currentTx && (node.id === currentTx.sender || node.id === currentTx.receiver)) {
                        size = size * 1.5;
                    } else if (!activeReconstruction.timeline.some(t => t.sender === node.id || t.receiver === node.id)) {
                        // Dim nodes not in the ring
                        color = '#1e293b';
                    }
                }

                return {
                    ...node,
                    val: size,
                    color: color
                };
            }),
            links: data.edges.map(edge => {
                let color = edge.color || "#e2e8f0";
                let width = 1;

                if (isReconstructing) {
                    color = "#1e293b"; // Dim by default
                    if (currentTx && edge.source === currentTx.sender && edge.target === currentTx.receiver) {
                        color = "#ff0000";
                        width = 4;
                    } else if (activeReconstruction.timeline.some(t =>
                        (t.sender === edge.source && t.receiver === edge.target)
                    )) {
                        color = "#475569"; // Highlighted path
                        width = 2;
                    }
                }

                return {
                    source: edge.source,
                    target: edge.target,
                    color: color,
                    width: width
                };
            })
        };
    }, [data, activeReconstruction, currentFrame]);

    useEffect(() => {
        // Auto-fit graph on data load
        if (fgRef.current && graphData.nodes.length > 0) {
            try {
                const linkForce = fgRef.current.d3Force("link");
                if (linkForce) linkForce.distance(15).strength(2.5);
                const chargeForce = fgRef.current.d3Force("charge");
                if (chargeForce) chargeForce.strength(-25); // Reduced repulsion to bring clusters closer
                const centerForce = fgRef.current.d3Force("center");
                if (centerForce) centerForce.strength(1.5); // Stronger centering force
            } catch (e) {
                console.warn("Force initialization pending...", e);
            }

            // If we just started a reconstruction, focus on the first node
            if (activeReconstruction && currentFrame === 0 && fgRef.current) {
                const firstNodeId = activeReconstruction.timeline[0].sender;
                const node = graphData.nodes.find(n => n.id === firstNodeId);
                if (node) {
                    const distance = 150;
                    fgRef.current.cameraPosition({ x: node.x, y: node.y, z: node.z + distance }, node, 2000);
                }
            } else if (!activeReconstruction) {
                setTimeout(() => {
                    if (fgRef.current) fgRef.current.zoomToFit(600, 100);
                }, 800);
            }
        }
    }, [graphData, activeReconstruction]);

    if (!data || !data.nodes) return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
            <div className="animate-pulse mb-4 text-primary">●</div>
            <div className="text-sm font-medium tracking-tight">Initializing 3D Spatial Engine...</div>
        </div>
    );

    return (
        <div className="w-full h-full relative border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-2xl">
            <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                backgroundColor="#020617"
                nodeLabel={node => `
          <div class="bg-slate-900 border border-slate-700 p-2 rounded shadow-lg text-xs">
            <div class="font-bold text-slate-200">ID: ${node.label}</div>
            <div class="text-primary mt-1">${Math.round(node.suspicion_score)}% Suspicion</div>
            <div class="text-slate-400 font-bold uppercase text-[8px] mt-1">${node.role || node.pattern || 'legitimate'}</div>
          </div>
        `}
                nodeColor={node => node.color}
                nodeVal={node => node.val}
                nodeResolution={24}
                linkWidth={link => link.width || 1}
                linkColor={link => link.color}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                linkCurvature={0.25}
                showNavInfo={false}
                onNodeClick={node => {
                    const distance = 40;
                    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
                    fgRef.current.cameraPosition(
                        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                        node,
                        3000
                    );
                }}
            />

            {/* Narrative Overlay */}
            {activeReconstruction && currentFrame >= 0 && (
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
                    <div className="bg-slate-900/90 backdrop-blur-md border border-primary/30 p-4 rounded-xl shadow-2xl max-w-2xl w-full animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Reconstructing {activeReconstruction.ring_id}</span>
                            <span className="text-[10px] font-mono text-slate-500">Step {currentFrame + 1} of {activeReconstruction.timeline.length}</span>
                        </div>
                        <div className="text-sm font-medium text-slate-200">
                            {activeReconstruction.timeline[currentFrame].sender} <span className="text-primary mx-1">→</span> ₹{activeReconstruction.timeline[currentFrame].amount.toLocaleString()} <span className="text-primary mx-1">→</span> {activeReconstruction.timeline[currentFrame].receiver}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 italic">
                            {ROLE_COLORS[activeReconstruction.timeline[currentFrame].sender_role] ? activeReconstruction.timeline[currentFrame].sender_role : 'SENDER'} is transferring funds to {ROLE_COLORS[activeReconstruction.timeline[currentFrame].receiver_role] ? activeReconstruction.timeline[currentFrame].receiver_role : 'RECEIVER'}
                        </div>
                    </div>
                </div>
            )}

            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md p-4 rounded-lg border border-slate-700 shadow-xl pointer-events-none">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{activeReconstruction ? 'Role Legend' : 'Nacht Detect Legend'}</h4>
                <div className="flex flex-col space-y-2">
                    {activeReconstruction ? (
                        Object.entries(ROLE_COLORS).map(([role, color]) => (
                            <div key={role} className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                                <span className="text-[10px] text-slate-300 uppercase font-bold">{role.replace('_', ' ')}</span>
                            </div>
                        ))
                    ) : (
                        <>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-[#ff4d4d]"></div>
                                <span className="text-xs text-slate-300">Ring Center / Suspicious</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-[#fbbf24]"></div>
                                <span className="text-xs text-slate-300">Ring Member</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                                <span className="text-xs text-slate-300">Legitimate</span>
                            </div>
                        </>
                    )}
                </div>
                <p className="text-[9px] text-slate-500 mt-2 italic">Drag to rotate • Scroll to zoom • Click node to focus</p>
            </div>

            <div className="absolute top-4 right-4 z-10">
                <button
                    onClick={() => fgRef.current.zoomToFit(800, 100)}
                    className="bg-slate-800/50 hover:bg-slate-700/80 text-slate-300 text-[10px] font-bold uppercase px-3 py-1.5 rounded border border-slate-700 backdrop-blur transition-all"
                >
                    Reset View (Fit)
                </button>
            </div>
        </div>
    );
};

export default GraphVisualization;

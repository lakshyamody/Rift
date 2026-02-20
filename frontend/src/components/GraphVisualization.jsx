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

const GraphVisualization = ({ data, activeReconstruction = null }) => {
    const fgRef = useRef();

    // Memoize graph data for force-graph
    const graphData = useMemo(() => {
        if (!data) return { nodes: [], links: [] };

        const isReconstructing = activeReconstruction !== null;

        // Find center accounts (orchestrators/collectors) in the reconstruction
        const ringCenters = new Set();
        const regularMembers = new Set();

        if (isReconstructing) {
            activeReconstruction.timeline.forEach(t => {
                if (['ORCHESTRATOR', 'COLLECTOR'].includes(t.sender_role)) ringCenters.add(t.sender);
                if (['ORCHESTRATOR', 'COLLECTOR'].includes(t.receiver_role)) ringCenters.add(t.receiver);

                regularMembers.add(t.sender);
                regularMembers.add(t.receiver);
            });
        }

        return {
            nodes: data.nodes.map(node => {
                let color = node.color;
                let size = node.size || 5;

                if (isReconstructing) {
                    if (ringCenters.has(node.id)) {
                        color = '#ff4d4d'; // Red for centers
                        size = size * 1.5;
                    } else if (regularMembers.has(node.id)) {
                        color = '#fbbf24'; // Yellow for members
                        size = size * 1.2;
                    } else {
                        color = '#1e293b'; // Grey for others
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
                    const isInRing = activeReconstruction.timeline.some(t =>
                        (t.sender === edge.source && t.receiver === edge.target)
                    );
                    if (isInRing) {
                        color = "#ff4d4f"; // Highlighted ring link
                        width = 2.5;
                    } else {
                        color = "#1e293b"; // Dim non-ring link
                        width = 1;
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
    }, [data, activeReconstruction]);

    useEffect(() => {
        // Auto-fit graph on data load
        if (fgRef.current && graphData.nodes.length > 0) {
            try {
                const linkForce = fgRef.current.d3Force("link");
                if (linkForce) linkForce.distance(15).strength(2.5);
                const chargeForce = fgRef.current.d3Force("charge");
                if (chargeForce) chargeForce.strength(-25);
                const centerForce = fgRef.current.d3Force("center");
                if (centerForce) centerForce.strength(1.5);
            } catch (e) {
                console.warn("Force initialization pending...", e);
            }

            // Always fit view when reconstruction state changes or data loads
            setTimeout(() => {
                if (fgRef.current) fgRef.current.zoomToFit(600, 100);
            }, activeReconstruction ? 100 : 800);
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

            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md p-4 rounded-lg border border-slate-700 shadow-xl pointer-events-none">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {activeReconstruction ? 'Ring Investigation Legend' : 'Nacht Detect Legend'}
                </h4>
                <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-[#ff4d4d]"></div>
                        <span className="text-xs text-slate-300">Ring Center / Orchestrator</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-[#fbbf24]"></div>
                        <span className="text-xs text-slate-300">Ring Member / Muling Account</span>
                    </div>
                    {!activeReconstruction && (
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                            <span className="text-xs text-slate-300">Other Network Nodes</span>
                        </div>
                    )}
                    {activeReconstruction && (
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-full bg-[#1e293b]"></div>
                            <span className="text-xs text-slate-300">Non-Involved Accounts</span>
                        </div>
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

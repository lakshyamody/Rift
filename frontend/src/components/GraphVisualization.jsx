import React, { useRef, useEffect, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

const GraphVisualization = ({ data }) => {
    const fgRef = useRef();

    // Memoize graph data for force-graph
    const graphData = useMemo(() => {
        if (!data) return { nodes: [], links: [] };

        return {
            nodes: data.nodes.map(node => ({
                ...node,
                // Ensure size is handled
                val: node.size || 5
            })),
            links: data.edges.map(edge => ({
                source: edge.source,
                target: edge.target,
                color: edge.color || "#e2e8f0"
            }))
        };
    }, [data]);

    useEffect(() => {
        // Auto-fit graph on data load
        if (fgRef.current && graphData.nodes.length > 0) {
            // Configure forces for tighter clustering
            fgRef.current.d3Force("link").distance(30).strength(1.5);
            fgRef.current.d3Force("charge").strength(-80);

            // Small delay to ensure engine has started
            setTimeout(() => {
                fgRef.current.zoomToFit(400, 100);
            }, 500);
        }
    }, [graphData]);

    if (!data) return <div className="flex items-center justify-center h-full text-slate-400">Loading complex network scenarios...</div>;

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
            <div class="text-slate-400 uppercase text-[8px] mt-1 font-bold">${node.pattern || 'legitimate'}</div>
          </div>
        `}
                nodeColor={node => node.color}
                nodeVal={node => node.val}
                nodeResolution={24}
                linkWidth={1}
                linkColor={link => link.color}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                linkCurvature={0.25}
                showNavInfo={false}
                onNodeClick={node => {
                    // Aim at node from outside it
                    const distance = 40;
                    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

                    fgRef.current.cameraPosition(
                        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
                        node, // lookAt ({ x, y, z })
                        3000  // ms transition duration
                    );
                }}
            />

            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md p-4 rounded-lg border border-slate-700 shadow-xl pointer-events-none">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">3D GNN Legend</h4>
                <div className="flex flex-col space-y-2">
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

import React, { useEffect, useRef, useState, useCallback } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

// Role colors — consistent with summary panel
const ROLE_COLORS = {
    ORCHESTRATOR: "#ff4444",
    COLLECTOR: "#ff8800",
    SHELL: "#ffcc00",
    MULE: "#60a5fa",
    EXIT_POINT: "#f472b6",
    RECRUITER: "#cc66ff",
    UNKNOWN: "#555555",
};

const DIM_NODE = "#1a1a1a";
const DIM_EDGE = "#111111";
const ACTIVE_EDGE_COLOR = "#ff4444";

export default function GNNReplay({ sigmaData, containerWidth }) {
    const containerRef = useRef(null);
    const sigmaRef = useRef(null);
    const graphRef = useRef(null);

    const [step, setStep] = useState(-1);   // -1 = overview (no step active)
    const [ready, setReady] = useState(false);

    const frames = sigmaData?.frames ?? [];
    const nodes = sigmaData?.nodes ?? [];
    const total = frames.length;

    // ── Init Sigma once on mount ───────────────────────
    useEffect(() => {
        if (!containerRef.current || !sigmaData) return;
        if (sigmaRef.current) return;

        const graph = new Graph({ type: "directed" });

        // Add all nodes
        nodes.forEach(n => {
            if (!graph.hasNode(n.id)) {
                graph.addNode(n.id, {
                    label: n.id,
                    size: n.size ?? 8,
                    color: ROLE_COLORS[n.role] ?? "#555",
                    x: Math.random(),
                    y: Math.random(),
                });
            }
        });

        // Add all edges from frames
        frames.forEach(frame => {
            const { source, target } = frame.active_edge || {};
            if (source && target) {
                const edgeId = `${source}--${target}`;
                if (!graph.hasEdge(edgeId)) {
                    graph.addEdgeWithKey(edgeId, source, target, {
                        color: DIM_EDGE,
                        size: 1,
                    });
                }
            }
        });

        // Run layout
        forceAtlas2.assign(graph, {
            iterations: 150,
            settings: {
                gravity: 1,
                scalingRatio: 2,
                strongGravityMode: false,
                barnesHutOptimize: true,
            }
        });

        // Init Sigma
        const renderer = new Sigma(graph, containerRef.current, {
            renderEdgeLabels: false,
            defaultEdgeColor: DIM_EDGE,
            defaultNodeColor: "#555",
            minCameraRatio: 0.1,
            maxCameraRatio: 10,
            autoRescale: false,
        });

        sigmaRef.current = renderer;
        graphRef.current = graph;
        setReady(true);

        // Fit view after small delay
        setTimeout(() => {
            renderer.refresh();
            renderer.getCamera().animatedReset();
        }, 200);

        return () => {
            if (sigmaRef.current) {
                sigmaRef.current.kill();
                sigmaRef.current = null;
                graphRef.current = null;
            }
        };
    }, [sigmaData, nodes, frames]);

    // ── Apply step highlighting ────────────────────────
    const applyStep = useCallback((stepIndex) => {
        const graph = graphRef.current;
        if (!graph) return;

        if (stepIndex === -1) {
            nodes.forEach(n => {
                if (graph.hasNode(n.id)) {
                    graph.setNodeAttribute(n.id, "color", ROLE_COLORS[n.role] ?? "#555");
                    graph.setNodeAttribute(n.id, "size", n.size ?? 8);
                }
            });
            graph.edges().forEach(e => {
                graph.setEdgeAttribute(e, "color", DIM_EDGE);
                graph.setEdgeAttribute(e, "size", 1);
                graph.setEdgeAttribute(e, "type", "arrow");
            });
        } else {
            const frame = frames[stepIndex];
            if (!frame) return;

            const activeNodes = new Set(frame.highlight_nodes ?? []);
            const activeSrc = frame.active_edge?.source;
            const activeTgt = frame.active_edge?.target;

            nodes.forEach(n => {
                if (!graph.hasNode(n.id)) return;
                if (activeNodes.has(n.id)) {
                    graph.setNodeAttribute(n.id, "color", ROLE_COLORS[n.role] ?? "#ff4444");
                    graph.setNodeAttribute(n.id, "size", (n.size ?? 8) * 1.6);
                } else {
                    graph.setNodeAttribute(n.id, "color", DIM_NODE);
                    graph.setNodeAttribute(n.id, "size", (n.size ?? 8) * 0.8);
                }
            });

            graph.edges().forEach(e => {
                const src = graph.source(e);
                const tgt = graph.target(e);
                if (src === activeSrc && tgt === activeTgt) {
                    graph.setEdgeAttribute(e, "color", ACTIVE_EDGE_COLOR);
                    graph.setEdgeAttribute(e, "size", 4);
                } else {
                    graph.setEdgeAttribute(e, "color", DIM_EDGE);
                    graph.setEdgeAttribute(e, "size", 1);
                }
            });
        }

        sigmaRef.current?.refresh();
    }, [frames, nodes]);

    useEffect(() => {
        if (ready) applyStep(step);
    }, [step, ready, applyStep]);

    const goTo = (s) => setStep(Math.max(-1, Math.min(total - 1, s)));
    const prev = () => goTo(step - 1);
    const next = () => goTo(step + 1);
    const reset = () => setStep(-1);

    const frame = step >= 0 ? frames[step] : null;

    return (
        <div style={{
            width: containerWidth || "100%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "#080808",
            border: "1px solid #1a1a1a",
            borderRadius: 12,
            overflow: "hidden",
            margin: "0 auto"
        }}>
            <div style={{
                padding: "12px 20px",
                borderBottom: "1px solid #1a1a1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#0d0d0d"
            }}>
                <div style={{ color: "#555", fontSize: 10, fontBold: "bold", letterSpacing: 1 }}>
                    GNN MONEY TRAIL — {sigmaData?.ring_id}
                </div>
                <div style={{ color: "#444", fontSize: 10, fontMono: true }}>
                    {step === -1 ? "OVERVIEW" : `STEP ${step + 1} / ${total}`}
                </div>
            </div>

            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: 480,
                    position: "relative",
                    background: "#050505"
                }}
            />

            <div style={{
                height: 80,
                borderTop: "1px solid #1a1a1a",
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "#090909"
            }}>
                {frame ? (
                    <>
                        <div style={{
                            background: "#220000",
                            border: "1px solid #800",
                            borderRadius: "50%",
                            width: 32, height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ff4444",
                            fontSize: 12, fontWeight: "bold",
                            flexShrink: 0,
                        }}>
                            {step + 1}
                        </div>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{
                                color: "#eee",
                                fontSize: 13,
                                lineHeight: 1.4,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontWeight: "500"
                            }}>
                                {frame.narrative_line}
                            </div>
                            <div style={{ color: "#555", fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {frame.timestamp}
                                {frame.cumulative_amount && (
                                    <span style={{ marginLeft: 15, color: "#4ade80", fontWeight: "bold" }}>
                                        TOTAL DETECTED: ₹{frame.cumulative_amount.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ color: "#444", fontSize: 13, fontWeight: "500" }}>
                        {ready
                            ? "Use controls below to investigate the money flow"
                            : "Constructing GNN layout..."}
                    </div>
                )}
            </div>

            <div style={{
                borderTop: "1px solid #1a1a1a",
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#0d0d0d"
            }}>
                <button onClick={reset}
                    style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#888", padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: "bold" }}>
                    RESET
                </button>

                <button onClick={prev} disabled={step <= -1}
                    style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: step <= -1 ? "#333" : "#ccc", padding: "6px 14px", cursor: step <= -1 ? "default" : "pointer", fontSize: 11, fontWeight: "bold" }}>
                    PREV
                </button>

                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {frames.slice(0, Math.min(total, 25)).map((_, i) => (
                        <div key={i}
                            onClick={() => setStep(i)}
                            style={{
                                width: i === step ? 16 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: i === step ? "#ff4444" : i < step ? "#4b1a1a" : "#222",
                                cursor: "pointer",
                                transition: "all 0.2s"
                            }} />
                    ))}
                    {total > 25 && <span style={{ color: "#444", fontSize: 10 }}>+{total - 25}</span>}
                </div>

                <button onClick={next} disabled={step >= total - 1}
                    style={{ background: step >= total - 1 ? "#1a1a1a" : "#7f1d1d", border: "1px solid #991b1b", borderRadius: 6, color: step >= total - 1 ? "#333" : "#fff", padding: "6px 14px", cursor: step >= total - 1 ? "default" : "pointer", fontSize: 11, fontWeight: "bold" }}>
                    NEXT
                </button>
            </div>
        </div>
    );
}

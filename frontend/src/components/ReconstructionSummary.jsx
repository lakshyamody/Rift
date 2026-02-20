import React from "react";

export default function ReconstructionSummary({ ring }) {
    if (!ring) return null;

    // Use ring.network if available, or fall back to ringData structure
    const path = ring.network?.dominant_path ?? ring.dominant_path ?? [];
    const financial = ring.financial ?? ring.financial_summary ?? {};
    const network = ring.network ?? ring.network_structure ?? {};
    const roles = network.role_breakdown ?? {};

    const riskColor = ring.risk_score >= 80 ? "#ff4444"
        : ring.risk_score >= 60 ? "#ff8800"
            : "#ffcc00";

    return (
        <div style={{
            background: "#0d0d0d",
            borderBottom: "1px solid #1a1a1a",
            padding: "12px 20px",
            flexShrink: 0,
        }}>
            {/* Row 1 — key numbers */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 12,
                marginBottom: 10,
            }}>
                {[
                    ["Risk Score", `${(ring.risk_score || 0).toFixed(0)}/100`, riskColor],
                    ["Muling Detection", `₹${(financial.estimated_laundered ?? 0).toLocaleString()}`, "#88ff88"],
                    ["Duration", `${financial.duration_hours ?? 0}h`, "#88ccff"],
                    ["Transactions", financial.num_transactions ?? 0, "#ffcc00"],
                    ["Members", ring.member_accounts?.length ?? 0, "#cc88ff"],
                ].map(([label, value, color]) => (
                    <div key={label} style={{
                        background: "#111",
                        border: "1px solid #1a1a1a",
                        borderRadius: 4,
                        padding: "8px 12px",
                    }}>
                        <div style={{
                            color: "#444", fontSize: 9,
                            letterSpacing: 1, marginBottom: 3
                        }}>
                            {label.toUpperCase()}
                        </div>
                        <div style={{
                            color, fontSize: 15,
                            fontWeight: "bold"
                        }}>
                            {value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Row 2 — entry, exit, path */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 8,
                flexWrap: "nowrap",
                overflow: "hidden",
            }}>
                {/* Entry */}
                <div style={{ flexShrink: 0 }}>
                    <div style={{
                        color: "#444", fontSize: 9,
                        letterSpacing: 1, marginBottom: 3
                    }}>
                        ENTRY
                    </div>
                    <div style={{
                        color: "#ff8888", fontSize: 11,
                        background: "#1a0000",
                        border: "1px solid #600",
                        borderRadius: 4, padding: "3px 8px"
                    }}>
                        {network.entry_point ?? "—"}
                    </div>
                </div>

                {/* Dominant path — scrollable if long */}
                <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{
                        color: "#444", fontSize: 9,
                        letterSpacing: 1, marginBottom: 3
                    }}>
                        MONEY PATH
                    </div>
                    <div className="custom-scrollbar" style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        overflowX: "auto",
                        paddingBottom: 2,
                    }}>
                        {path.map((acc, i) => (
                            <div key={i} style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4, flexShrink: 0
                            }}>
                                <div style={{
                                    background: "#111",
                                    border: "1px solid #2a2a2a",
                                    borderRadius: 3,
                                    padding: "2px 7px",
                                    fontSize: 10,
                                    color: "#aaa",
                                    whiteSpace: "nowrap",
                                }}>
                                    {acc}
                                </div>
                                {i < path.length - 1 && (
                                    <span style={{
                                        color: "#333",
                                        fontSize: 10
                                    }}>→</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Exit */}
                <div style={{ flexShrink: 0 }}>
                    <div style={{
                        color: "#444", fontSize: 9,
                        letterSpacing: 1, marginBottom: 3
                    }}>
                        EXIT
                    </div>
                    <div style={{
                        color: "#ff8888", fontSize: 11,
                        background: "#1a0000",
                        border: "1px solid #600",
                        borderRadius: 4, padding: "3px 8px"
                    }}>
                        {network.exit_point ?? "—"}
                    </div>
                </div>
            </div>

            {/* Row 3 — roles inline */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(roles).map(([role, accounts]) => {
                    if (!accounts?.length) return null;
                    const roleColor = {
                        ORCHESTRATOR: "#ff4444",
                        COLLECTOR: "#ff8800",
                        SHELL: "#ffcc00",
                        MULE: "#60a5fa",
                        EXIT_POINT: "#f472b6",
                        RECRUITER: "#cc66ff",
                    }[role] ?? "#888";
                    return (
                        <div key={role} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5
                        }}>
                            <span style={{
                                color: roleColor, fontSize: 9,
                                border: `1px solid ${roleColor}`,
                                borderRadius: 3,
                                padding: "1px 5px",
                                letterSpacing: 1
                            }}>
                                {role}
                            </span>
                            <span style={{ color: "#555", fontSize: 10 }}>
                                {accounts.slice(0, 5).join(", ")}{accounts.length > 5 ? "..." : ""}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

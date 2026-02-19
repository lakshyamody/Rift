"""
Full analysis pipeline: orchestrates graph building, detection, scoring,
and ring ID assignment to produce the final AnalysisResult.
"""
import time
import networkx as nx
import pandas as pd
from typing import Dict, Any

from graph.builder import parse_csv, build_graph
from graph.cycle_detector import detect_cycles
from graph.smurfing_detector import detect_smurfing
from graph.shell_detector import detect_shell_networks
from graph.scorer import compute_scores
from models.schemas import (
    SuspiciousAccount, FraudRing, AnalysisSummary, AnalysisResult
)


def run_analysis(file_content: bytes) -> Dict[str, Any]:
    start_time = time.time()

    # 1. Parse CSV and build graph
    df = parse_csv(file_content)
    G, node_stats = build_graph(df)

    # 2. Detect patterns
    cycle_rings_raw = detect_cycles(G)
    smurfing_rings_raw = detect_smurfing(G, df, node_stats)
    shell_rings_raw = detect_shell_networks(G, node_stats)

    # 3. Assign Ring IDs and collect members + patterns
    fraud_rings = []
    ring_counter = 1

    # Maps: account -> ring_id, account -> patterns list
    account_to_ring: Dict[str, str] = {}
    detected_patterns_map: Dict[str, list] = {}

    def assign_ring(members, pattern_type, pattern_label, risk_base):
        nonlocal ring_counter
        # Deduplicate members
        members = list(dict.fromkeys(members))
        ring_id = f"RING_{ring_counter:03d}"
        ring_counter += 1

        # Risk score based on pattern type and ring size
        size_bonus = min(len(members) * 2, 20)
        risk_score = min(risk_base + size_bonus, 100.0)

        fraud_rings.append(FraudRing(
            ring_id=ring_id,
            member_accounts=members,
            pattern_type=pattern_type,
            risk_score=round(risk_score, 1),
        ))

        for acc in members:
            # Assign ring ID (first ring wins if already assigned)
            if acc not in account_to_ring:
                account_to_ring[acc] = ring_id
            detected_patterns_map.setdefault(acc, [])
            if pattern_label not in detected_patterns_map[acc]:
                detected_patterns_map[acc].append(pattern_label)

    # Cycle rings
    for r in cycle_rings_raw:
        assign_ring(
            members=r["members"],
            pattern_type="cycle",
            pattern_label=r["pattern_label"],
            risk_base=75.0,
        )

    # Smurfing rings
    for r in smurfing_rings_raw:
        labels = r["pattern_labels"]
        label_str = "_".join(sorted(labels))  # e.g. "fan_in_fan_out" or "fan_in"
        assign_ring(
            members=r["members"],
            pattern_type="smurfing",
            pattern_label=label_str,
            risk_base=65.0,
        )

    # Shell network rings
    for r in shell_rings_raw:
        assign_ring(
            members=r["members"],
            pattern_type="shell_network",
            pattern_label="shell_chain",
            risk_base=60.0,
        )

    # 4. Identify sets for scoring
    cycle_members = set()
    for r in cycle_rings_raw:
        cycle_members.update(r["members"])

    smurfing_members = set()
    for r in smurfing_rings_raw:
        smurfing_members.update(r["members"])

    shell_members = set()
    for r in shell_rings_raw:
        shell_members.update(r["members"])

    # 5. Compute scores
    scores = compute_scores(
        cycle_members, smurfing_members, shell_members,
        set(G.nodes()), df, detected_patterns_map
    )

    # 6. Build SuspiciousAccount list, sorted descending by score
    suspicious_accounts = []
    for acc, score in sorted(scores.items(), key=lambda x: -x[1]):
        ring_id = account_to_ring.get(acc, "RING_UNKNOWN")
        patterns = detected_patterns_map.get(acc, [])
        suspicious_accounts.append(SuspiciousAccount(
            account_id=acc,
            suspicion_score=round(score, 1),
            detected_patterns=patterns,
            ring_id=ring_id,
        ))

    processing_time = round(time.time() - start_time, 3)

    result = AnalysisResult(
        suspicious_accounts=suspicious_accounts,
        fraud_rings=fraud_rings,
        summary=AnalysisSummary(
            total_accounts_analyzed=G.number_of_nodes(),
            suspicious_accounts_flagged=len(suspicious_accounts),
            fraud_rings_detected=len(fraud_rings),
            processing_time_seconds=processing_time,
        ),
    )

    # Also return node/edge data for graph viz
    nodes_data = []
    for node in G.nodes():
        stats = node_stats.get(node, {})
        is_suspicious = node in scores
        nodes_data.append({
            "id": node,
            "suspicion_score": scores.get(node, 0.0),
            "ring_id": account_to_ring.get(node, None),
            "patterns": detected_patterns_map.get(node, []),
            "total_transactions": stats.get("total_transactions", 0),
            "in_degree": stats.get("in_degree", 0),
            "out_degree": stats.get("out_degree", 0),
            "is_suspicious": is_suspicious,
        })

    edges_data = []
    for src, dst, data in G.edges(data=True):
        txns = data.get("transactions", [])
        edges_data.append({
            "source": src,
            "target": dst,
            "total_amount": round(data.get("total_amount", 0), 2),
            "transaction_count": len(txns),
        })

    return {
        "result": result.model_dump(),
        "graph": {
            "nodes": nodes_data,
            "edges": edges_data,
        },
    }

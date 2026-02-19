"""
Smurfing detector: Detects fan-in and fan-out patterns.
Fan-in: 10+ unique senders → 1 receiver within 72-hour window.
Fan-out: 1 sender → 10+ unique receivers within 72-hour window.
False positive guard: exclude high-volume merchants and payroll accounts.

Optimized: pre-index transactions by node for O(N log N) overall complexity.
"""
import networkx as nx
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Set
from datetime import timedelta

FAN_THRESHOLD = 10
TIME_WINDOW_HOURS = 72
HIGH_VOLUME_COUNTERPARTY_THRESHOLD = 50  # likely payroll/merchant

WINDOW_NS = int(timedelta(hours=TIME_WINDOW_HOURS).total_seconds() * 1e9)


def _is_legitimate_account(node: str, node_stats: dict) -> bool:
    """Return True if account looks like a legitimate high-volume merchant or payroll."""
    stats = node_stats.get(node, {})
    return stats.get("unique_counterparties", 0) >= HIGH_VOLUME_COUNTERPARTY_THRESHOLD


def _max_unique_in_window(timestamps_ns: np.ndarray, counterparties: list) -> int:
    """
    Max unique counterparties in any TIME_WINDOW_HOURS window.
    O(N log N) using numpy searchsorted with early exit.
    """
    n = len(timestamps_ns)
    if n < FAN_THRESHOLD:
        return n  # shortcut: can't exceed what exists
    max_unique = 0
    for i in range(n):
        j = int(np.searchsorted(timestamps_ns, timestamps_ns[i] + WINDOW_NS, side='right'))
        unique = len(set(counterparties[i:j]))
        if unique > max_unique:
            max_unique = unique
        if max_unique >= FAN_THRESHOLD:
            break  # early exit — threshold met
    return max_unique


def detect_smurfing(
    G: nx.DiGraph, df: pd.DataFrame, node_stats: dict
) -> List[Dict[str, Any]]:
    """
    Detect fan-in and fan-out smurfing patterns.
    Pre-groups all transactions by node to avoid per-node full DataFrame scans.
    """
    rings = []
    processed_nodes: Set[str] = set()

    # Pre-build fast lookup: receiver -> sorted (timestamp_ns, sender) series
    # and sender -> sorted (timestamp_ns, receiver) series
    df_sorted = df.copy()
    df_sorted["ts_ns"] = df_sorted["timestamp"].values.astype(np.int64)

    # Group by receiver
    receiver_groups = {}
    for receiver, grp in df_sorted.groupby("receiver_id"):
        grp = grp.sort_values("ts_ns")
        receiver_groups[receiver] = (
            grp["ts_ns"].values,
            list(grp["sender_id"])
        )

    # Group by sender
    sender_groups = {}
    for sender, grp in df_sorted.groupby("sender_id"):
        grp = grp.sort_values("ts_ns")
        sender_groups[sender] = (
            grp["ts_ns"].values,
            list(grp["receiver_id"])
        )

    for node in G.nodes():
        if _is_legitimate_account(node, node_stats):
            continue

        patterns = []

        # Fan-in check (as receiver)
        if node in receiver_groups:
            ts_ns, senders = receiver_groups[node]
            if _max_unique_in_window(ts_ns, senders) >= FAN_THRESHOLD:
                patterns.append("fan_in")

        # Fan-out check (as sender)
        if node in sender_groups:
            ts_ns, receivers = sender_groups[node]
            if _max_unique_in_window(ts_ns, receivers) >= FAN_THRESHOLD:
                patterns.append("fan_out")

        if patterns and node not in processed_nodes:
            processed_nodes.add(node)
            neighbors = set(G.predecessors(node)) | set(G.successors(node))
            members = [node] + [
                n for n in neighbors if not _is_legitimate_account(n, node_stats)
            ]
            rings.append({
                "members": members,
                "pattern_labels": patterns,
            })

    return rings

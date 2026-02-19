"""
Suspicion scorer: Computes a 0–100 suspicion score for each account
based on detected patterns.

Score components:
  +40  in a cycle (cycle_length_3/4/5)
  +25  smurfing (fan-in or fan-out)
  +20  shell network node
  +10  high velocity (>5 transactions within 24 hours)
  +5   round-number transaction amounts (smurfing indicator)

Final score is capped at 100.
"""
import pandas as pd
from typing import Dict, Set
from datetime import timedelta


def _high_velocity(node: str, df: pd.DataFrame) -> bool:
    """Return True if node has >5 transactions within any 24-hour window."""
    node_txns = df[(df["sender_id"] == node) | (df["receiver_id"] == node)].copy()
    if len(node_txns) <= 5:
        return False
    node_txns = node_txns.sort_values("timestamp")
    timestamps = node_txns["timestamp"].tolist()
    for i, t in enumerate(timestamps):
        count = sum(1 for ts in timestamps[i:] if ts <= t + timedelta(hours=24))
        if count > 5:
            return True
    return False


def _round_amounts(node: str, df: pd.DataFrame) -> bool:
    """Return True if majority of sent amounts are round numbers (smurfing indicator)."""
    sent = df[df["sender_id"] == node]["amount"]
    if sent.empty:
        return False
    round_count = (sent % 100 == 0).sum()
    return round_count / len(sent) > 0.6


def compute_scores(
    cycle_members: Set[str],
    smurfing_members: Set[str],
    shell_members: Set[str],
    all_nodes: Set[str],
    df: pd.DataFrame,
    detected_patterns_map: Dict[str, list],
) -> Dict[str, float]:
    """
    Compute suspicion scores for all suspicious nodes.
    Returns dict: account_id -> score (0-100)
    """
    scores = {}
    suspicious = cycle_members | smurfing_members | shell_members

    for node in suspicious:
        score = 0.0
        if node in cycle_members:
            score += 40
        if node in smurfing_members:
            score += 25
        if node in shell_members:
            score += 20
        if _high_velocity(node, df):
            score += 10
            detected_patterns_map.setdefault(node, [])
            if "high_velocity" not in detected_patterns_map[node]:
                detected_patterns_map[node].append("high_velocity")
        if _round_amounts(node, df):
            score += 5
            detected_patterns_map.setdefault(node, [])
            if "round_amounts" not in detected_patterns_map[node]:
                detected_patterns_map[node].append("round_amounts")
        scores[node] = min(score, 100.0)

    return scores

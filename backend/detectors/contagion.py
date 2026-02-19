import networkx as nx
import pandas as pd
import numpy as np
from typing import Dict
from collections import defaultdict

def graph_contagion(G: nx.DiGraph, phase1_scores: Dict[str, float], df: pd.DataFrame, threshold: float = 60.0) -> Dict[str, float]:
    """Propagates suspicion scores from confirmed high-risk nodes (seeds) to direct neighbors."""
    seeds = {acc for acc, score in phase1_scores.items() if score >= threshold}
    latest_ts = df.timestamp.max()
    contagion = defaultdict(float)

    total_amount = df.amount.sum()
    log_total_amount = np.log1p(total_amount)

    for seed in seeds:
        seed_score = phase1_scores[seed]

        # Outbound: seed -> receiver (full contagion, they accepted the money)
        for recv in G.successors(seed):
            txns = df[(df.sender_id == seed) & (df.receiver_id == recv)]
            if txns.empty: continue
            
            # Weight by amount relative to total system volume (log scale)
            amt_weight = np.log1p(txns.amount.sum()) / log_total_amount if log_total_amount > 0 else 0
            
            # Decay by recency
            days_ago = (latest_ts - txns.timestamp.max()).days
            rec_weight = np.exp(-days_ago / 30.0)
            
            impact = seed_score * amt_weight * rec_weight
            contagion[recv] = max(contagion[recv], impact)

        # Inbound: sender -> seed (50% contagion, seed might be mule recruiting unwitting sender, but unwitting sender rarely sends TO fraudster)
        # Actually in mule networks, sender -> seed means sender is funding the mule. High risk.
        # But heuristic says 0.5. Let's stick to user request.
        for send in G.predecessors(seed):
            txns = df[(df.sender_id == send) & (df.receiver_id == seed)]
            if txns.empty: continue
            
            amt_weight = np.log1p(txns.amount.sum()) / log_total_amount if log_total_amount > 0 else 0
            days_ago = (latest_ts - txns.timestamp.max()).days
            rec_weight = np.exp(-days_ago / 30.0)
            
            impact = seed_score * amt_weight * rec_weight * 0.5
            contagion[send] = max(contagion[send], impact)

    return dict(contagion)

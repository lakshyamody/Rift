import pandas as pd
import numpy as np
import networkx as nx
from typing import List, Dict, Any, Set
from collections import Counter
import math

def detect_mule_collectors(
    df: pd.DataFrame, 
    lookback_days: int = 7,
    min_unique_senders: int = 5,
    max_sender_amount: float = 2000.0,
    new_sender_threshold: float = 0.7
) -> List[Dict[str, Any]]:
    """
    Identifies accounts exhibiting Mule Collector behavior:
    - Sudden inflow from multiple NEW, unrelated sources.
    """
    results = []
    
    # Pre-calculate communities for sender diversity check
    # We can use a simple Louvain or just connected components?
    # For speed, let's skip complex community detection here and use direct neighbor check 
    # (Sender Isolation Score).
    
    # Build historical sender relationships for each receiver
    # "Historical" = everything before the lookback window
    if df.empty: return []
    
    latest_ts    = df.timestamp.max()
    lookback_start = latest_ts - pd.Timedelta(days=lookback_days)
    
    historical     = df[df.timestamp < lookback_start]
    recent         = df[df.timestamp >= lookback_start]

    if recent.empty: return []

    # For each account: who did they historically receive from?
    historical_senders = (historical.groupby('receiver_id')['sender_id']
                                    .apply(set).to_dict())

    # Optimize: Pre-group recent by receiver
    grouped = recent.groupby('receiver_id')
    
    for receiver, inbound in grouped:
        if len(inbound) < min_unique_senders:
            continue

        unique_senders = inbound['sender_id'].unique()
        if len(unique_senders) < min_unique_senders:
            continue
            
        # 1. New Sender Ratio
        known_senders = historical_senders.get(receiver, set())
        all_recent_senders = set(unique_senders)
        new_senders = all_recent_senders - known_senders
        
        new_sender_ratio = 0
        if len(all_recent_senders) > 0:
            new_sender_ratio = len(new_senders) / len(all_recent_senders)

        if new_sender_ratio < new_sender_threshold:
            continue  # mostly known senders — likely legitimate

        # 2. Small Transaction Ratio (Smurfing pattern)
        small_txns = inbound[inbound['amount'] <= max_sender_amount]
        small_ratio = len(small_txns) / len(inbound)

        # 3. Burst Score (Senders per Hour)
        time_span_hours = (
            inbound.timestamp.max() - inbound.timestamp.min()
        ).total_seconds() / 3600
        burst_score = len(unique_senders) / max(time_span_hours, 1)

        # 4. Sender Isolation Score (Are senders unrelated?)
        # If senders have NO shared transaction history with each other, they are "unrelated"
        # which is the hallmark of a distributed mule network.
        # This is O(N^2) where N is senders. With N=10-20 it is fast.
        sender_list = list(all_recent_senders)
        
        # We need check if sender_i ever transacted with sender_j in the FULL df
        # Optimization: Build a graph of sender-sender interactions once?
        # Or just checking pairs.
        # Let's check pairs for small N.
        
        sender_interconnections = 0
        if len(sender_list) < 50: # Limit check to avoid explosion
            # Get subset of DF involving these senders
            sender_subset = df[
                (df.sender_id.isin(sender_list)) & 
                (df.receiver_id.isin(sender_list))
            ]
            if not sender_subset.empty:
                # We have connections
                G_senders = nx.from_pandas_edgelist(sender_subset, 'sender_id', 'receiver_id')
                # Count edges in the subgraph of these senders
                sender_interconnections = G_senders.number_of_edges()
        
        max_possible_connections = len(sender_list) * (len(sender_list) - 1) / 2
        sender_isolation_score = 1.0
        if max_possible_connections > 0:
            sender_isolation_score = 1.0 - (sender_interconnections / max_possible_connections)
        
        # Composite mule collector score
        # Cap burst score impact
        mule_score = (
            0.30 * new_sender_ratio      +   # fraction of new, unknown senders
            0.25 * small_ratio           +   # fraction of small (smurf) amounts
            0.25 * min(burst_score / 10.0, 1.0) +   # how fast (normalized: 10/hr is saturation)
            0.20 * sender_isolation_score    # how unrelated the senders are
        ) * 100

        risk_label = 'MEDIUM'
        if mule_score >= 75:
            risk_label = 'CRITICAL'
        elif mule_score >= 50:
            risk_label = 'HIGH'

        if mule_score > 40: # filter noise
            results.append({
                'receiver_id'          : receiver,
                'mule_collector_score' : round(mule_score, 2),
                'unique_senders'       : len(unique_senders),
                'new_sender_count'     : len(new_senders),
                'new_sender_ratio'     : round(new_sender_ratio, 3),
                'small_txn_ratio'      : round(small_ratio, 3),
                'total_inflow'         : round(inbound.amount.sum(), 2),
                'time_span_hours'      : round(time_span_hours, 1),
                'burst_score'          : round(burst_score, 3),
                'sender_isolation'     : round(sender_isolation_score, 3),
                'risk_label'           : risk_label
            })

    return sorted(results, key=lambda x: -x['mule_collector_score'])

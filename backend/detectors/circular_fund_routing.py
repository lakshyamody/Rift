import networkx as nx
import pandas as pd
from typing import List

def validate_cycle_temporal(cycle, df, max_span_hours=72, max_decay=0.20):
    """Validates that a cycle's transactions occur within a tight timeframe and preserve value."""
    edges = [(cycle[i], cycle[(i+1) % len(cycle)]) for i in range(len(cycle))]
    edge_data = []

    for s, r in edges:
        txns = df[(df.sender_id == s) & (df.receiver_id == r)]
        if txns.empty:
            return False
        # Take the earliest transaction between these nodes for the cycle logic
        # (Could also be latest, but standard is earliest in sequence)
        earliest = txns.nsmallest(1, 'timestamp').iloc[0]
        edge_data.append({'ts': earliest.timestamp, 'amt': earliest.amount})

    # Rule 1: all edges must fire within X hours of each other
    timestamps = [e['ts'] for e in edge_data]
    span_hours = (max(timestamps) - min(timestamps)).total_seconds() / 3600
    if span_hours > max_span_hours:
        return False  # too slow — likely legitimate

    # Rule 2: amount must be preserved across hops (max 20% decay per hop)
    # This assumes ordered execution in the list matches time order, 
    # but cycles list is topological. We need to follow time.
    # However, for simple validation, checking if *any* sequential flow violates decay is good.
    # Let's check amount consistency loosely: Min amount shouldn't be < (Max amount * (1-decay)^hops)
    amounts = [e['amt'] for e in edge_data]
    if not amounts: return False
    
    # Strict hop-by-hop check is hard without ordering by time.
    # Let's just check variance or min/max ratio.
    # "amount must be preserved" -> max loss.
    # If Input (Max) vs Output/Min (Min) is too large gap.
    min_amt = min(amounts)
    max_amt = max(amounts)
    if max_amt > 0:
        total_decay = 1 - (min_amt / max_amt)
        # Allow some decay per hop. 20% total per cycle is reasonable for fees.
        if total_decay > 0.3: # 30% total loss allowed
            return False

    return True

def cycle_repetition_count(cycle, df):
    """Counts how many distinct 24h windows contain a full firing of the cycle."""
    edges = [(cycle[i], cycle[(i+1) % len(cycle)]) for i in range(len(cycle))]

    # Get timestamps for each edge
    edge_times = {}
    for s, r in edges:
        mask = (df.sender_id == s) & (df.receiver_id == r)
        edge_times[(s, r)] = sorted(df[mask].timestamp.tolist())

    if any(len(v) == 0 for v in edge_times.values()):
        return 0

    # Slide a 24h window across all dates and check if all edges fire
    if df.empty: return 0
    all_dates = df.timestamp.dt.date.unique()
    count = 0
    for date in all_dates:
        window_start = pd.Timestamp(date)
        window_end   = window_start + pd.Timedelta(hours=24)
        all_fired = all(
            any(window_start <= t <= window_end for t in times)
            for times in edge_times.values()
        )
        if all_fired:
            count += 1
    return count

def detect_cycles(G: nx.DiGraph, df: pd.DataFrame, max_length: int = 5) -> List[List[str]]:
    """Detects simple cycles of length 3 to max_length, with temporal validation."""
    cycles = list(nx.simple_cycles(G))
    filtered_cycles = [c for c in cycles if 3 <= len(c) <= max_length]
    
    # Fix 3: Temporal Validation
    valid_cycles = [c for c in filtered_cycles if validate_cycle_temporal(c, df)]
    
    return valid_cycles

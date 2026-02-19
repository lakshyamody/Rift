import pandas as pd
import networkx as nx
import numpy as np
from ..detectors.cycles import detect_cycles, cycle_repetition_count

def extract_features(df: pd.DataFrame, G: nx.DiGraph) -> pd.DataFrame:
    """
    Extracts comprehensive features for ML model including:
    - Volume & Flow
    - Amount Patterns (Structuring, Repetition)
    - Counterparty Behavior
    - Graph Structure (Centrality, Clustering)
    - Cycle & Community Signals
    - Temporal Features (Velocity, Bursts, Lifecycle)
    """
    all_accounts = list(G.nodes())
    features = pd.DataFrame(index=all_accounts)
    
    # --- 1. Volume & Flow ---
    sent_stats = df.groupby('sender_id')['amount'].agg(['sum', 'count']).rename(columns={'sum': 'total_sent', 'count': 'count_sent'})
    recv_stats = df.groupby('receiver_id')['amount'].agg(['sum', 'count']).rename(columns={'sum': 'total_recv', 'count': 'count_recv'})
    features = features.join(sent_stats).join(recv_stats).fillna(0)
    
    features['net_flow'] = features['total_recv'] - features['total_sent']
    features['total_volume'] = features['total_recv'] + features['total_sent']
    
    # Sent/Received Ratio
    features['flow_ratio'] = features.apply(
        lambda x: x['total_sent'] / x['total_recv'] if x['total_recv'] > 0 else (x['total_sent'] if x['total_sent'] > 0 else 0), axis=1
    )
    
    # Pass-through Ratio (Received & Forwarded within 24h)
    features['pass_through_proxy'] = features.apply(
        lambda x: min(x['total_sent'], x['total_recv']) / max(x['total_sent'], x['total_recv']) if max(x['total_sent'], x['total_recv']) > 0 else 0,
        axis=1
    )

    # --- 2. Amount Patterns ---
    # Structuring Score: Count txs just below 10,000 or 50,000 (e.g., 9000-9999)
    def calculate_structuring(amounts):
        thresholds = [10000, 50000]
        score = 0
        for t in thresholds:
            score += ((amounts >= t * 0.9) & (amounts < t)).sum()
        return score
        
    struct_scores = df.groupby('sender_id')['amount'].apply(calculate_structuring).rename('structuring_out')
    struct_scores_in = df.groupby('receiver_id')['amount'].apply(calculate_structuring).rename('structuring_in')
    features = features.join(struct_scores).join(struct_scores_in).fillna(0)
    features['structuring_score'] = features['structuring_out'] + features['structuring_in']
    
    # Repeated Exact Amounts
    def count_repeats(amounts):
        counts = amounts.value_counts()
        return counts[counts > 1].sum()
    
    repeat_scores = df.groupby('sender_id')['amount'].apply(count_repeats).rename('repeated_amounts')
    features = features.join(repeat_scores).fillna(0)

    # CV (Coef of Variation)
    def calc_cv(amounts):
        if len(amounts) < 2: return 0
        mean = amounts.mean()
        if mean == 0: return 0
        return amounts.std() / mean

    cv_out = df.groupby('sender_id')['amount'].apply(calc_cv).rename('cv_out')
    cv_in = df.groupby('receiver_id')['amount'].apply(calc_cv).rename('cv_in')
    features = features.join(cv_out).join(cv_in).fillna(0)
    
    # --- 3. Counterparty Behavior ---
    unique_buddies = df.groupby('sender_id')['receiver_id'].nunique().rename('unique_receivers')
    unique_sources = df.groupby('receiver_id')['sender_id'].nunique().rename('unique_senders')
    features = features.join(unique_buddies).join(unique_sources).fillna(0)
    
    # --- 4. Graph Structure Features ---
    # PageRank
    try:
        pagerank = nx.pagerank(G, alpha=0.85)
        features['pagerank'] = pd.Series(pagerank)
    except:
        features['pagerank'] = 0
        
    # Degree Centrality
    in_degree = pd.Series(dict(G.in_degree()))
    out_degree = pd.Series(dict(G.out_degree()))
    features['in_degree'] = in_degree
    features['out_degree'] = out_degree
    
    # Clustering Coefficient (convert to undirected for standard clustering)
    G_undir = G.to_undirected()
    clustering = nx.clustering(G_undir)
    features['clustering_coef'] = pd.Series(clustering)
    
    # --- 5. Temporal Features ---
    # Burst Score: Max txs in a single hour
    df['hour'] = df['timestamp'].dt.floor('H')
    bursts = df.groupby(['sender_id', 'hour']).size().groupby('sender_id').max().rename('max_hourly_tx')
    features = features.join(bursts).fillna(0)
    features['burst_score'] = features['max_hourly_tx'] # Simple proxy
    
    # Activity Lifecycle
    NOW = df['timestamp'].max()
    lifecycle = df.groupby(['sender_id'])['timestamp'].agg(['min', 'max'])
    if not lifecycle.empty:
        features['days_active'] = (lifecycle['max'] - lifecycle['min']).dt.total_seconds() / 86400
        features['days_since_first'] = (NOW - lifecycle['min']).dt.total_seconds() / 86400
    else:
        features['days_active'] = 0
        features['days_since_first'] = 0

    # Fix 4: Cycle Repetition Feature
    # We need cycles here. But cycles are calc in analyze_transactions.
    # Ideally should be passed in or calc here. Calculating here is expensive if redundant.
    # Let's perform a lightweight cycle check or just compute it since G is small usually.
    cycles = detect_cycles(G, df) # Re-using the robust one
    
    cycle_reps_map = {}
    for acc in features.index:
        cycle_reps_map[acc] = 0
        
    for cycle in cycles:
        reps = cycle_repetition_count(cycle, df)
        for member in cycle:
            cycle_reps_map[member] = max(cycle_reps_map[member], reps)
            
    features['cycle_repetition_count'] = pd.Series(cycle_reps_map)

    # Fix 2: Log-Transform Amount Features
    amount_cols = ['total_sent', 'total_recv', 'net_flow', 'total_volume']
    # Ensure cols exist
    for col in amount_cols:
         if col in features.columns:
             # Sign-preserving log
             features[col] = features[col].apply(lambda x: np.sign(x) * np.log1p(np.abs(x)))

    return features.fillna(0)

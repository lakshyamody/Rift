import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Dict

from ..core.graph import build_graph
from ..core.utils import fuse_scores
from ..features.extractor import extract_features
from ..detectors.contagion import graph_contagion

def calculate_ml_suspicion_scores(df: pd.DataFrame) -> Dict[str, float]:
    """
    Uses Isolation Forest with comprehensive feature set to detect anomalous behavior.
    """
    # Build Graph first for graph features
    G = build_graph(df)
    
    # Extract Features
    features_df = extract_features(df, G)
    
    # Select subset for ML model
    model_columns = [
        'total_volume', 'count_sent', 'count_recv', 'net_flow', 
        'pass_through_proxy', 'structuring_score', 'repeated_amounts',
        'cv_out', 'cv_in', 'unique_receivers', 'unique_senders',
        'pagerank', 'in_degree', 'out_degree', 'clustering_coef',
        'burst_score', 'days_active', 'cycle_repetition_count'
    ]
    
    # Ensure all columns exist
    for col in model_columns:
        if col not in features_df.columns:
            features_df[col] = 0
            
    X = features_df[model_columns].values
    
    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Train Isolation Forest
    # Contamination assumption: 5-10% fraud
    clf = IsolationForest(contamination=0.10, random_state=42, n_estimators=200) 
    clf.fit(X_scaled)
    
    # Get Base scores
    scores = clf.decision_function(X_scaled) 
    
    min_score = scores.min()
    max_score = scores.max()
    
    if max_score == min_score:
        normalized_scores = np.zeros(len(scores))
    else:
        normalized_scores = 100 * (1 - (scores - min_score) / (max_score - min_score))
    
    phase1_scores = {acc: score for acc, score in zip(features_df.index, normalized_scores)}
    
    # Fix 1: Graph Contagion
    contagion = graph_contagion(G, phase1_scores, df, threshold=60.0)
    final_scores = fuse_scores(phase1_scores, contagion)
    
    return final_scores

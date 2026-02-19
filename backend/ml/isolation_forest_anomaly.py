import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Dict

from ..core.graph import build_graph
from ..core.utils import fuse_scores
from ..features.extractor import extract_features
# from ..detectors.contagion import graph_contagion # Not using in anomaly file anymore if it was circular? 
# Wait, we need contagion here or orchestrated? 
# The original file had graph_contagion import.
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
    # Contamination assumption: ~1-2% fraud in realistic datasets
    clf = IsolationForest(contamination=0.02, random_state=42, n_estimators=200) 
    clf.fit(X_scaled)
    
    # Get Base scores
    scores = clf.decision_function(X_scaled) 
    # Get Binary Predictions (-1 for outlier, 1 for inlier)
    predictions = clf.predict(X_scaled)
    
    min_score = scores.min()
    max_score = scores.max()
    
    if max_score == min_score:
        normalized_scores = np.zeros(len(scores))
    else:
        normalized_scores = 100 * (1 - (scores - min_score) / (max_score - min_score))
        
    # Strict Masking: If IsolationForest says "Normal" (1), set score to 0 (or low bottleneck).
    # We only want to highlight the certified anomalies.
    for i, pred in enumerate(predictions):
        if pred == 1:
            normalized_scores[i] = 0.0 # Force normal to 0
            
    phase1_scores = {acc: score for acc, score in zip(features_df.index, normalized_scores)}
    
    # Fix 1: Graph Contagion
    contagion = graph_contagion(G, phase1_scores, df, threshold=60.0)
    final_scores = fuse_scores(phase1_scores, contagion)
    
    return final_scores

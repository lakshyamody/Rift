from typing import Dict

def fuse_scores(phase1_scores: Dict[str, float], contagion_scores: Dict[str, float]) -> Dict[str, float]:
    """Combines Isolation Forest scores with Graph Contagion scores."""
    # Normalize contagion scores to 0-100 range relative to max found contagion
    max_cont = max(contagion_scores.values()) if contagion_scores else 1.0
    final = {}
    for acc in phase1_scores:
        p1 = phase1_scores[acc]
        # Scale contagion to 0-100 based on max observed contagion in this graph
        # This ensures the "most infected" node gets high boost
        p2 = (contagion_scores.get(acc, 0.0) / max_cont) * 100.0 if max_cont > 0 else 0
        
        # Weighted avg: 60% ML/Pattern, 40% Contagion
        final[acc] = 0.6 * p1 + 0.4 * p2
    return final

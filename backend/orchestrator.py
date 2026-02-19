import time
import pandas as pd
from typing import Dict, Any

from .core.graph import build_graph
from .detectors.cycles import detect_cycles
from .detectors.smurfing import detect_smurfing
from .detectors.shells import detect_shells
from .ml.anomalies import calculate_ml_suspicion_scores

def analyze_transactions(df: pd.DataFrame) -> Dict[str, Any]:
    start_time = time.time()
    
    # Preprocessing
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Graph Construction
    G = build_graph(df)
    
    # 1. Cycle Detection
    cycles = detect_cycles(G, df)
    
    # 2. Smurfing Detection
    smurfing = detect_smurfing(df)
    
    # 3. Shell Detection
    shells = detect_shells(G, df)
    
    # 3. ML Anomaly Detection (Run last to potentially use ring info? No, it's parallel feature)
    ml_scores = calculate_ml_suspicion_scores(df)
    
    # Aggregate Results
    suspicious_accounts = []
    fraud_rings = []
    
    # Helper to track account -> ring_id
    account_ring_map = {}
    
    # 1. Process Cycles
    for i, cycle in enumerate(cycles):
        ring_id = f"RING_CYCLE_{i+1:03d}"
        for member in cycle:
            account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": cycle,
            "pattern_type": "cycle",
            "risk_score": min(90.0 + (len(cycle) * 2), 100.0)
        })
        
    # 2. Process Smurfing
    for i, pattern in enumerate(smurfing):
        ring_id = f"RING_SMURF_{i+1:03d}"
        members = [pattern['center']] + pattern['members']
        for member in members:
            # Overwrite if exists? Or allow multiple? Simple map for now.
            if member not in account_ring_map:
                account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": members,
            "pattern_type": pattern['type'],
            "risk_score": 95.0 if pattern['type'] == 'fan_in_out' else 85.0
        })

    # 3. Process Shells
    for i, chain in enumerate(shells):
        # Deduplication: Check if this shell overlaps significantly with existing rings (e.g. Cycles)
        overlap_count = 0
        for member in chain:
            if member in account_ring_map:
                overlap_count += 1
        
        # If more than 50% of the shell is already in a ring, skip it (likely a Cycle detected as line)
        if overlap_count > len(chain) * 0.5:
            continue

        ring_id = f"RING_SHELL_{i+1:03d}"
        for member in chain:
            if member not in account_ring_map:
                account_ring_map[member] = ring_id
        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": chain,
            "pattern_type": "layered_shell",
            "risk_score": 80.0
        })

    # Compile Suspicious Accounts
    all_accounts = set(df['sender_id']).union(set(df['receiver_id']))
    
    for account in all_accounts:
        patterns = []
        ring_id = account_ring_map.get(account)
        
        # Check membership in rings to determine pattern tagging
        # (Optimized: we already built the map, but we need pattern names)
        
        # We can iterate rings again or build a better map. 
        # Let's just check rings.
        for ring in fraud_rings:
            if account in ring['member_accounts']:
                if ring['pattern_type'] == 'cycle':
                     patterns.append(f"cycle_member")
                elif 'fan_' in ring['pattern_type']:
                    if account == ring['member_accounts'][0]: # center is first in our list constr logic
                        patterns.append(f"{ring['pattern_type']}_center")
                    else:
                        patterns.append(f"{ring['pattern_type']}_member")
                elif ring['pattern_type'] == 'layered_shell':
                    patterns.append("shell_member")
        
        base_score = ml_scores.get(account, 0)
        
        # Score Logic
        # - If in a ring, High Score (80+)
        # - If Center of Smurf, Very High (90+)
        # - If Cycle Member, High (90+)
        
        final_score = base_score
        
        if patterns:
            # High Priority: Center of Smurfing, Cycle Members, Fan-In Members (Senders), Shell Members
            if any('center' in p for p in patterns) or \
               any('cycle' in p for p in patterns) or \
               any('shell' in p for p in patterns) or \
               any('fan_in_member' in p for p in patterns):
                final_score = max(final_score, 90.0)
            elif any('fan_out_member' in p for p in patterns):
                # Fan-Out recipients (Drop accounts/Victims) are lower risk unless they have other activity
                # Do not boost arbitrarily high, but keep relevant if ML score is high
                pass 
            else:
                final_score = max(final_score, 75.0)
                
        # Only report if threshold met
        if final_score > 50:
            suspicious_accounts.append({
                "account_id": account,
                "suspicion_score": float(final_score),
                "detected_patterns": list(set(patterns)), # dedupe
                "ring_id": ring_id
            })
            
    # Sort by score
    suspicious_accounts.sort(key=lambda x: x['suspicion_score'], reverse=True)
    
    processing_time = time.time() - start_time
    
    return {
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings": fraud_rings,
        "summary": {
            "total_accounts_analyzed": len(all_accounts),
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected": len(fraud_rings),
            "processing_time_seconds": round(processing_time, 4)
        }
    }

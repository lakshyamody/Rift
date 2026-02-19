import networkx as nx
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

ROLE_DESCRIPTIONS = {
    'ORCHESTRATOR': 'the controlling account that directed fund movements',
    'COLLECTOR'   : 'a collection point aggregating funds from multiple sources',
    'SHELL'       : 'a pass-through shell account with minimal real activity',
    'MULE'        : 'a mule account used to layer and obscure fund origin',
    'EXIT_POINT'  : 'the final exit point where funds were withdrawn or converted',
    'RECRUITER'   : 'a distributor account that seeded multiple mule accounts',
    'UNKNOWN'     : 'an account with suspicious connectivity patterns'
}

def classify_node_role(acc, G, df):
    """
    Classifies each account into a role using topological features.
    """
    in_deg = G.in_degree(acc)
    out_deg = G.out_degree(acc)
    
    # Calculate PageRank on the fly if needed, but for performance 
    # we'll use degrees and simple metrics first. 
    # High centrality = Hub/Orchestrator
    
    # Simple passthrough ratio
    total_tx = in_deg + out_deg
    if total_tx == 0: return 'UNKNOWN'
    
    in_vol = df[df['receiver_id'] == acc]['amount'].sum()
    out_vol = df[df['sender_id'] == acc]['amount'].sum()
    
    pt_ratio = min(in_vol, out_vol) / max(in_vol, out_vol) if max(in_vol, out_vol) > 0 else 0

    if out_deg >= 5 and in_deg <= 2:
        return 'RECRUITER'
    if in_deg >= 5 and out_deg <= 2:
        return 'COLLECTOR'
    if out_deg >= 3 and in_deg >= 3 and pt_ratio > 0.8:
        return 'ORCHESTRATOR'
    if in_deg >= 1 and out_deg >= 1 and pt_ratio > 0.9 and total_tx <= 4:
        return 'SHELL'
    if out_deg == 0 and in_deg >= 1:
        return 'EXIT_POINT'
    
    return 'MULE'

def reconstruct_money_trail(ring_id, ring_accounts, df, G, node_roles):
    """
    Traces the dominant flow of funds through a ring chronologically.
    """
    # 1. Transactions within the ring
    ring_txns = df[
        (df.sender_id.isin(ring_accounts)) & 
        (df.receiver_id.isin(ring_accounts))
    ].sort_values('timestamp').copy()

    if ring_txns.empty:
        return None

    # 2. Find entry/exit
    external_inflows = df[
        (~df.sender_id.isin(ring_accounts)) & 
        (df.receiver_id.isin(ring_accounts))
    ]
    entry_candidates = external_inflows['receiver_id'].value_counts()
    
    external_outflows = df[
        (df.sender_id.isin(ring_accounts)) & 
        (~df.receiver_id.isin(ring_accounts))
    ]
    exit_candidates = external_outflows['sender_id'].value_counts()

    entry = entry_candidates.index[0] if not entry_candidates.empty else ring_txns.iloc[0]['sender_id']
    exit_p = exit_candidates.index[0] if not exit_candidates.empty else ring_txns.iloc[-1]['receiver_id']

    # 3. Build sequence
    timeline = []
    for idx, txn in ring_txns.iterrows():
        timeline.append({
            'step': len(timeline) + 1,
            'timestamp': txn['timestamp'].isoformat(),
            'sender': str(txn['sender_id']),
            'sender_role': node_roles.get(txn['sender_id'], 'UNKNOWN'),
            'receiver': str(txn['receiver_id']),
            'receiver_role': node_roles.get(txn['receiver_id'], 'UNKNOWN'),
            'amount': float(txn['amount']),
            'txn_id': str(txn.get('transaction_id', f"TX_{idx}"))
        })

    return {
        'ring_id': ring_id,
        'entry_point': str(entry),
        'exit_point': str(exit_p),
        'total_amount': float(ring_txns['amount'].sum()),
        'timeline': timeline
    }

def generate_crime_narrative(trail, ring_meta):
    """
    Generates a human-friendly story of the fraud.
    """
    if not trail: return "No reconstruction available for this ring."
    
    summary = f"Operation {trail['ring_id']} involved laundering ₹{trail['total_amount']:,.2f}. "
    summary += f"Money entered through {trail['entry_point']} and was layered through {len(trail['timeline'])} transitions."
    
    return summary

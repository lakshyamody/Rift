import networkx as nx
import pandas as pd
from typing import List

def detect_shells(G: nx.DiGraph, df: pd.DataFrame) -> List[List[str]]:
    """
    Layered Shell Networks: Chains of 3+ hops where intermediate accounts have low transaction counts.
    e.g. A->B->C->D. B and C have degree ~2 (1 in, 1 out).
    """
    shells = []
    # Find all path components that look like lines
    # We can iterate over nodes with in_degree=1 and out_degree=1
    intermediates = [n for n in G.nodes() if G.in_degree(n) == 1 and G.out_degree(n) == 1]
    
    visited = set()
    for node in intermediates:
        if node in visited:
            continue
            
        # Trace forward
        chain = [node]
        curr = node
        while True:
            succ_list = list(G.successors(curr))
            if not succ_list: break
            succ = succ_list[0]
            if G.in_degree(succ) == 1 and G.out_degree(succ) == 1:
                if succ in chain: break # Cycle detected, handled elsewhere
                chain.append(succ)
                visited.add(succ)
                curr = succ
            else:
                # Add the endpoint
                chain.append(succ)
                break
                
        # Trace backward
        curr = node
        while True:
            pred_list = list(G.predecessors(curr))
            if not pred_list: break
            pred = pred_list[0]
            if G.in_degree(pred) == 1 and G.out_degree(pred) == 1:
                if pred in chain: break
                chain.insert(0, pred)
                visited.add(pred)
                curr = pred
            else:
                chain.insert(0, pred)
                break
                
        if len(chain) >= 4: # 3 hops means 4 nodes (A->B->C->D)
            # Validation: Money must flow sequentially and amounts must be similar
            if validate_shell_flow(chain, df):
                shells.append(chain)
            
    return shells

def validate_shell_flow(chain: List[str], df: pd.DataFrame) -> bool:
    """
    Validates that a chain of nodes represents a flow of funds.
    1. Time must be increasing (t1 <= t2 <= t3)
    2. Amount must be preserved (a2 <= a1 * 1.05 and a2 >= a1 * 0.8)
       (Allow slight increase for currency fluctuation or slight decrease for fees)
    """
    current_time = pd.Timestamp.min
    # We need to track the "flow amount"
    # But A might send 100 to B, and B sends 90 to C.
    # We need to find *matching* transactions.
    
    # Heuristic: Take the *largest* transaction in the correct direction?
    # Or just average?
    # Let's try to map the sequence.
    
    last_amt = None
    last_time = None
    
    for i in range(len(chain) - 1):
        sender = chain[i]
        receiver = chain[i+1]
        
        # Get transactions between them
        txs = df[(df.sender_id == sender) & (df.receiver_id == receiver)]
        if txs.empty: return False
        
        # Filter by time > last_time
        if last_time is not None:
            txs = txs[txs.timestamp >= last_time]
            
        if txs.empty: return False
        
        # Select the best fit transaction (e.g., closest amount to last_amt?)
        if last_amt is not None:
             # Find tx with amount close to last_amt (e.g. 80-105%)
             # Shells usually pass almost all money.
             candidates = txs[
                 (txs.amount >= last_amt * 0.8) & 
                 (txs.amount <= last_amt * 1.05)
             ]
             if candidates.empty:
                 return False
             # Pick the earliest valid one
             best_tx = candidates.sort_values('timestamp').iloc[0]
        else:
             # First hop: Pick the largest transaction (representing the main flow)
             # or just the latest?
             # Let's pick largest to catch the "big shell game"
             best_tx = txs.sort_values('amount', ascending=False).iloc[0]
             
        last_amt = best_tx.amount
        last_time = best_tx.timestamp
        
    return True

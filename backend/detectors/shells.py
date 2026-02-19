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
            # Check intermediate transaction counts?
            # "intermediate accounts have only 2-3 total transactions"
            # Our degree check (1 in, 1 out) implies 2 transactions.
            shells.append(chain)
            
    return shells

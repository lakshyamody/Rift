import networkx as nx
import pandas as pd

def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    """Builds a directed graph from transaction data."""
    G = nx.DiGraph()
    # Add nodes first to ensure all accounts are present
    all_accounts = set(df['sender_id']).union(set(df['receiver_id']))
    G.add_nodes_from(all_accounts)
    
    # Add edges with attributes
    for _, row in df.iterrows():
        G.add_edge(
            row['sender_id'], 
            row['receiver_id'], 
            amount=row['amount'], 
            timestamp=row['timestamp'],
            transaction_id=row['transaction_id']
        )
    return G

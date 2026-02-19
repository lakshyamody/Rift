"""
Graph builder: Parses CSV transaction data and constructs a directed NetworkX graph.
"""
import pandas as pd
import networkx as nx
from typing import Tuple


REQUIRED_COLUMNS = {"transaction_id", "sender_id", "receiver_id", "amount", "timestamp"}


def parse_csv(file_content: bytes) -> pd.DataFrame:
    """Parse CSV bytes into a cleaned DataFrame."""
    import io
    df = pd.read_csv(io.BytesIO(file_content))
    df.columns = df.columns.str.strip()
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}")
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df.dropna(subset=["sender_id", "receiver_id", "amount", "timestamp"])
    df["sender_id"] = df["sender_id"].astype(str).str.strip()
    df["receiver_id"] = df["receiver_id"].astype(str).str.strip()
    return df


def build_graph(df: pd.DataFrame) -> Tuple[nx.DiGraph, dict]:
    """
    Build directed graph from transaction DataFrame.
    Returns:
        G: DiGraph with edge attrs (amount, timestamp, transaction_id)
        node_stats: dict of per-node statistics
    """
    G = nx.DiGraph()

    # Add all nodes
    all_accounts = set(df["sender_id"]) | set(df["receiver_id"])
    G.add_nodes_from(all_accounts)

    # Add edges (allow multi-edges stored as edge data list)
    for _, row in df.iterrows():
        src = row["sender_id"]
        dst = row["receiver_id"]
        if G.has_edge(src, dst):
            G[src][dst]["transactions"].append({
                "transaction_id": row["transaction_id"],
                "amount": row["amount"],
                "timestamp": row["timestamp"],
            })
            G[src][dst]["total_amount"] += row["amount"]
        else:
            G.add_edge(src, dst,
                       transactions=[{
                           "transaction_id": row["transaction_id"],
                           "amount": row["amount"],
                           "timestamp": row["timestamp"],
                       }],
                       total_amount=row["amount"])

    # Compute per-node stats
    node_stats = {}
    for node in G.nodes():
        sent = df[df["sender_id"] == node]
        received = df[df["receiver_id"] == node]
        total_txns = len(sent) + len(received)
        unique_counterparties = len(
            set(sent["receiver_id"]) | set(received["sender_id"])
        )
        avg_amount = df[df["sender_id"] == node]["amount"].mean() if len(sent) > 0 else 0.0

        node_stats[node] = {
            "total_transactions": total_txns,
            "sent_count": len(sent),
            "received_count": len(received),
            "unique_counterparties": unique_counterparties,
            "avg_sent_amount": avg_amount,
            "in_degree": G.in_degree(node),
            "out_degree": G.out_degree(node),
            "timestamps": sorted(
                list(sent["timestamp"]) + list(received["timestamp"])
            ),
        }

    return G, node_stats

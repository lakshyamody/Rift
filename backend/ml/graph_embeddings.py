import networkx as nx
import numpy as np
import pandas as pd
from typing import Dict, List, Any
try:
    from node2vec import Node2Vec
except ImportError:
    Node2Vec = None

def generate_graph_embeddings(G: nx.DiGraph, embedding_dim: int = 64) -> Dict[str, List[float]]:
    """
    Generates Node2Vec embeddings for each node in the graph.
    If Node2Vec library is missing, falls back to structural features.
    """
    if len(G.nodes()) == 0:
        return {}
        
    print("Generating Graph Embeddings...")
    
    # Check if we have enough nodes for meaningful embedding
    if len(G.nodes()) < 10:
        # Fallback: Zero embeddings
        return {n: [0.0]*embedding_dim for n in G.nodes()}

    if Node2Vec:
        # Node2Vec is slow on large graphs without parallel workers.
        # Use fast parameters for production speed.
        try:
            # We need an undirected graph for standard Node2Vec usually, 
            # or treat directed as undirected for structural role learning.
            # Node2Vec library handles graph type automatically.
            
            node2vec = Node2Vec(
                G, 
                dimensions=embedding_dim, 
                walk_length=10, 
                num_walks=10, 
                workers=1, # Parallelism might clash with server
                p=1, 
                q=1,
                quiet=True
            )
            model = node2vec.fit(window=5, min_count=1, batch_words=4)
            
            embeddings = {}
            for node in G.nodes():
                # Node2Vec model keys are strings
                if str(node) in model.wv:
                    embeddings[node] = model.wv[str(node)].tolist()
                else:
                    embeddings[node] = [0.0]*embedding_dim
            return embeddings
            
        except Exception as e:
            print(f"Node2Vec failed: {e}. Falling back to structural features.")
    
    # Fallback: Structural Features as "Embedding"
    # We create a vector of [In-Degree, Out-Degree, PageRank, Clustering, ...]
    # and pad with zeros to match dim.
    
    embeddings = {}
    pr = nx.pagerank(G)
    
    # Try clustering coefficient (convert to undirected for standard clustering)
    try:
        clustering = nx.clustering(G.to_undirected())
    except:
        clustering = {n: 0.0 for n in G.nodes()}
        
    for node in G.nodes():
        vec = [
            float(G.in_degree(node)),
            float(G.out_degree(node)),
            float(pr.get(node, 0)),
            float(clustering.get(node, 0))
        ]
        # Pad
        vec += [0.0] * (embedding_dim - len(vec))
        embeddings[node] = vec
        
    return embeddings

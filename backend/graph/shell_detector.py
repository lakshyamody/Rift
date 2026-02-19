"""
Shell network detector: Detects chains of 3+ hops where intermediate nodes
have very low total transaction counts (2-3), indicating shell / pass-through accounts.

Optimized: Only explores paths starting from nodes that connect to potential shells.
"""
import networkx as nx
from typing import List, Dict, Any, Set

SHELL_CHAIN_MIN_LENGTH = 3
SHELL_NODE_MAX_TRANSACTIONS = 3  # intermediate nodes with ≤ 3 total txns are shells
MAX_CHAINS = 2000  # hard cap to prevent too many results


def detect_shell_networks(
    G: nx.DiGraph, node_stats: dict
) -> List[Dict[str, Any]]:
    """
    Detect layered shell networks efficiently:
    - Pre-identify all shell candidate nodes (≤3 transactions)
    - Only explore paths FROM sources that have an edge INTO a shell node
    - DFS to depth 4 (chain of 5 nodes max) 
    """
    rings = []
    seen_chains: Set[tuple] = set()

    # Pre-identify shell nodes
    shell_nodes: Set[str] = {
        node for node, stats in node_stats.items()
        if stats.get("total_transactions", 0) <= SHELL_NODE_MAX_TRANSACTIONS
    }

    if not shell_nodes:
        return rings

    # Find source nodes: nodes that have at least one successor that is a shell
    source_nodes: Set[str] = set()
    for shell in shell_nodes:
        for pred in G.predecessors(shell):
            if pred not in shell_nodes:  # source should NOT itself be a shell
                source_nodes.add(pred)

    if not source_nodes:
        return rings

    for source in source_nodes:
        if len(rings) >= MAX_CHAINS:
            break
        # DFS from source, depth-limited to 4 edges (5 nodes)
        stack = [(source, [source])]
        while stack and len(rings) < MAX_CHAINS:
            current, path = stack.pop()
            if len(path) > 5:  # max 5 nodes = 4 hops
                continue
            for neighbor in G.successors(current):
                if neighbor in path:
                    continue
                new_path = path + [neighbor]
                # Check if this qualifies as a shell chain
                if len(new_path) >= SHELL_CHAIN_MIN_LENGTH:
                    intermediates = new_path[1:-1]
                    if intermediates and all(n in shell_nodes for n in intermediates):
                        canonical = tuple(new_path)
                        if canonical not in seen_chains:
                            seen_chains.add(canonical)
                            rings.append({
                                "members": new_path,
                                "chain_length": len(new_path),
                                "shell_intermediates": intermediates,
                            })
                # Continue DFS only if we're still going through potential shell territory
                if neighbor in shell_nodes or len(new_path) < SHELL_CHAIN_MIN_LENGTH:
                    stack.append((neighbor, new_path))

    return rings

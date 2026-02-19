"""
Cycle detector: Finds money muling rings via circular fund routing.

Optimized approach:
1. Find all Strongly Connected Components (SCCs) — O(V+E)
2. Only run simple_cycles on SCCs with ≥ 3 members (cycles impossible otherwise)
3. Cap at MAX_CYCLES total across all SCCs

This prevents the exponential blowup that occurs when simple_cycles is run
on large dense random-account subgraphs.
"""
import networkx as nx
from typing import List, Dict, Any

MAX_CYCLES = 5000  # hard cap across all SCCs


def detect_cycles(G: nx.DiGraph) -> List[Dict[str, Any]]:
    """
    Detect cycles of length 3 to 5 using SCC-pruned Johnson's algorithm.
    Only examines strongly-connected components with ≥ 3 nodes.
    """
    rings = []
    seen_cycles: set = set()
    total_count = 0

    # Step 1: Find all SCCs — O(V+E) with Tarjan's algorithm
    sccs = [scc for scc in nx.strongly_connected_components(G) if len(scc) >= 3]

    # Step 2: Run simple_cycles on each qualifying SCC subgraph
    for scc in sccs:
        if total_count >= MAX_CYCLES:
            break
        # Build subgraph for just this SCC
        subgraph = G.subgraph(scc)

        try:
            for cycle in nx.simple_cycles(subgraph):
                if total_count >= MAX_CYCLES:
                    break
                total_count += 1

                n = len(cycle)
                if n < 3 or n > 5:
                    continue

                # Canonical form for deduplication
                canonical = tuple(sorted(cycle))
                if canonical in seen_cycles:
                    continue
                seen_cycles.add(canonical)

                # Compute total flow around the ring
                total_flow = 0.0
                for i in range(n):
                    src = cycle[i]
                    dst = cycle[(i + 1) % n]
                    if G.has_edge(src, dst):
                        total_flow += G[src][dst]["total_amount"]

                rings.append({
                    "members": list(cycle),
                    "cycle_length": n,
                    "pattern_label": f"cycle_length_{n}",
                    "total_flow": total_flow,
                })

        except Exception:
            continue

    return rings

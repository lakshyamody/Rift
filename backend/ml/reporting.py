import pandas as pd
import json
from datetime import datetime
from collections import Counter, defaultdict

def build_ring_context(ring_id, trail, narrative, node_roles, node_scores, ring_meta, df, all_rings):
    """
    Builds a rich structured context object for one ring.
    This becomes the LLM's knowledge base for that ring.
    """
    ring_members = set(ring_meta['member_accounts'])

    # Transaction statistics 
    ring_txns = df[
        (df.sender_id.isin(ring_members)) |
        (df.receiver_id.isin(ring_members))
    ].copy()
    ring_txns['timestamp'] = pd.to_datetime(ring_txns['timestamp'])
    ring_txns = ring_txns.sort_values('timestamp')

    external_inflows  = df[
        (~df.sender_id.isin(ring_members)) &
        (df.receiver_id.isin(ring_members))
    ]
    external_outflows = df[
        (df.sender_id.isin(ring_members)) &
        (~df.receiver_id.isin(ring_members))
    ]

    # Cross-ring connections
    shared_accounts = []
    for other_ring in all_rings:
        if other_ring['ring_id'] == ring_id:
            continue
        other_members = set(other_ring['member_accounts'])
        overlap = ring_members & other_members
        if overlap:
            shared_accounts.append({
                'ring_id' : other_ring['ring_id'],
                'shared'  : list(overlap),
                'pattern' : other_ring.get('pattern_type')
            })

    # Per-account summaries
    account_summaries = {}
    for acc in ring_members:
        sent = df[df.sender_id == acc]
        recv = df[df.receiver_id == acc]
        
        # Calculate passthrough
        sent_sum = sent.amount.sum()
        recv_sum = recv.amount.sum()
        pt_pct = round(min(sent_sum / max(recv_sum, 1), 1) * 100, 1)

        account_summaries[str(acc)] = {
            'role'           : node_roles.get(acc, 'UNKNOWN'),
            'suspicion_score': round(float(node_scores.get(acc, 0)), 2),
            'total_sent'     : round(float(sent_sum), 2),
            'total_received' : round(float(recv_sum), 2),
            'num_transactions': len(sent) + len(recv),
            'unique_counterparties': len(set(sent.receiver_id) | set(recv.sender_id)),
            'first_seen'     : ring_txns[ring_txns.sender_id == acc].timestamp.min().isoformat() if not ring_txns[ring_txns.sender_id == acc].empty else ring_txns.timestamp.min().isoformat(),
            'last_seen'      : ring_txns[ring_txns.receiver_id == acc].timestamp.max().isoformat() if not ring_txns[ring_txns.receiver_id == acc].empty else ring_txns.timestamp.max().isoformat(),
            'passthrough_pct': pt_pct,
        }

    # Build the context dict
    context = {
        'ring_id'      : ring_id,
        'pattern_type' : ring_meta.get('pattern_type'),
        'risk_score'   : ring_meta.get('risk_score'),
        'detected_patterns': ring_meta.get('detected_patterns', []),

        'financial_summary': {
            'total_internal_flow'  : round(float(ring_txns.amount.sum()), 2),
            'external_inflow'      : round(float(external_inflows.amount.sum()), 2),
            'external_outflow'     : round(float(external_outflows.amount.sum()), 2),
            'estimated_laundered'  : round(float(external_outflows.amount.sum()), 2),
            'num_transactions'     : len(ring_txns),
            'avg_transaction_size' : round(float(ring_txns.amount.mean()), 2) if not ring_txns.empty else 0,
            'operation_start'      : ring_txns.timestamp.min().isoformat() if not ring_txns.empty else datetime.now().isoformat(),
            'operation_end'        : ring_txns.timestamp.max().isoformat() if not ring_txns.empty else datetime.now().isoformat(),
            'duration_hours'       : round((ring_txns.timestamp.max() - ring_txns.timestamp.min()).total_seconds() / 3600, 1) if not ring_txns.empty else 0,
        },

        'network_structure': {
            'member_count'    : len(ring_members),
            'entry_point'     : trail['entry_point'] if trail else 'UNKNOWN',
            'exit_point'      : trail['exit_point'] if trail else 'UNKNOWN',
            'dominant_path'   : [str(x) for x in trail['timeline'][0:5]] if trail else [], # simplified path
            'role_breakdown'  : {
                role: [str(a) for a in ring_members if node_roles.get(a) == role]
                for role in ['ORCHESTRATOR','COLLECTOR','SHELL','MULE','EXIT_POINT','RECRUITER']
            },
        },

        'timeline'       : trail['timeline'] if trail else [],
        'account_profiles': account_summaries,
        'cross_ring_links': shared_accounts,
        'narrative'      : narrative,
    }

    return context

def build_system_prompt(ring_context, all_ring_contexts, cross_ring_patterns):
    """
    Builds the LLM system prompt for a specific ring's chatbot.
    Includes awareness of other rings and cross-ring patterns.
    """
    rc  = ring_context
    fs  = rc['financial_summary']
    ns  = rc['network_structure']
    pat = rc['detected_patterns']

    other_rings_summary = ""
    for other in all_ring_contexts:
        if other['ring_id'] == rc['ring_id']:
            continue
        other_rings_summary += (
            f"- {other['ring_id']}: {other['pattern_type']}, "
            f"risk={other['risk_score']}, "
            f"\u20B9{other['financial_summary']['estimated_laundered']:,.0f} laundered, "
            f"{other['network_structure']['member_count']} accounts\n"
        )

    pattern_summary = ""
    for p in cross_ring_patterns:
        pattern_summary += f"- {p['pattern_name']}: {p['description']}\n"

    shared_str = ""
    shared = rc.get('cross_ring_links', [])
    for s in shared:
        shared_str += f"- Shares accounts {s['shared']} with {s['ring_id']} ({s['pattern']})\n"

    profiles_list = []
    for acc, data in rc['account_profiles'].items():
        profile = (
            f"- {acc}: {data['role']}, score={data['suspicion_score']}, "
            f"sent=₹{data['total_sent']:,.0f}, recv=₹{data['total_received']:,.0f}, "
            f"passthrough={data['passthrough_pct']}%, {data['num_transactions']} txns"
        )
        profiles_list.append(profile)
    profiles_str = "\n".join(profiles_list)

    system_prompt = f"""You are a financial crime analyst AI assistant specializing in money laundering investigation. You have been given full details of a detected fraud ring and must answer investigator questions accurately and concisely.

CURRENT RING: {rc['ring_id']}
Pattern Type: {rc['pattern_type']}
Risk Score: {rc['risk_score']}/100
Detected Techniques: {', '.join(pat)}

FINANCIAL SUMMARY:
- Total funds laundered: ₹{fs['estimated_laundered']:,.2f}
- External inflow: ₹{fs['external_inflow']:,.2f}
- Internal circulation: ₹{fs['total_internal_flow']:,.2f}
- Number of transactions: {fs['num_transactions']}
- Average transaction size: ₹{fs['avg_transaction_size']:,.2f}
- Operation ran from {fs['operation_start']} to {fs['operation_end']} ({fs['duration_hours']} hours)

NETWORK STRUCTURE:
- {ns['member_count']} member accounts
- Entry point: {ns['entry_point']}
- Exit point: {ns['exit_point']}
- Orchestrators: {', '.join(ns['role_breakdown'].get('ORCHESTRATOR', ['none identified']))}
- Shells: {', '.join(ns['role_breakdown'].get('SHELL', ['none']))}
- Collectors: {', '.join(ns['role_breakdown'].get('COLLECTOR', ['none']))}
- Exit points: {', '.join(ns['role_breakdown'].get('EXIT_POINT', ['none']))}

ACCOUNT PROFILES:
{profiles_str}

CRIME NARRATIVE:
{rc['narrative']}

CROSS-RING CONNECTIONS:
{shared_str if shared_str else "No direct account overlap with other rings."}

OTHER DETECTED RINGS:
{other_rings_summary if other_rings_summary else "No other rings detected."}

CROSS-RING PATTERNS IDENTIFIED:
{pattern_summary if pattern_summary else "No cross-ring patterns detected yet."}

INSTRUCTIONS:
- Answer questions specifically about {rc['ring_id']} using the data above.
- Reference roles, scores, and transaction data when asked about specific accounts.
- Use cross-ring data for connections to other rings.
- Clearly label speculation as inference.
- Format monetary values with ₹ and commas.
- Be concise but complete.
"""
    return system_prompt

def analyze_cross_ring_patterns(all_ring_contexts, df):
    """
    Identifies patterns that span multiple rings.
    """
    patterns_found = []

    # Pattern 1: Shared Accounts
    account_to_rings = defaultdict(list)
    for rc in all_ring_contexts:
        for acc in rc['account_profiles']:
            account_to_rings[acc].append(rc['ring_id'])

    bridge_accounts = {acc: rings for acc, rings in account_to_rings.items() if len(rings) > 1}
    if bridge_accounts:
        patterns_found.append({
            'pattern_name': 'CROSS_RING_BRIDGES',
            'severity': 'CRITICAL',
            'description': f"{len(bridge_accounts)} accounts appear in multiple rings, suggesting coordinated operation.",
            'implication': 'Indicates organized crime network with shared money mule pools.',
            'bridge_accounts': bridge_accounts
        })

    # Pattern 2: Timing Correlation
    overlapping_pairs = []
    for i in range(len(all_ring_contexts)):
        for j in range(i + 1, len(all_ring_contexts)):
            a = all_ring_contexts[i]['financial_summary']
            b = all_ring_contexts[j]['financial_summary']
            overlap_start = max(pd.Timestamp(a['operation_start']), pd.Timestamp(b['operation_start']))
            overlap_end   = min(pd.Timestamp(a['operation_end']), pd.Timestamp(b['operation_end']))
            if overlap_start < overlap_end:
                overlap_hours = (overlap_end - overlap_start).total_seconds() / 3600
                overlapping_pairs.append({
                    'rings': [all_ring_contexts[i]['ring_id'], all_ring_contexts[j]['ring_id']],
                    'overlap_hours': round(overlap_hours, 1)
                })

    if overlapping_pairs:
        patterns_found.append({
            'pattern_name': 'CONCURRENT_OPERATIONS',
            'severity': 'HIGH',
            'description': f"{len(overlapping_pairs)} ring pairs operated simultaneously.",
            'implication': 'Simultaneous rings suggest a single criminal organization running parallel channels.',
            'overlapping_pairs': overlapping_pairs
        })

    return patterns_found

def _build_actions(ns, rc):
    """Helper to generate prioritized investigator actions."""
    actions = []
    priority = 1
    orchestrators = ns['role_breakdown'].get('ORCHESTRATOR', [])
    if orchestrators:
        actions.append({"priority": priority, "urgency": "IMMEDIATE", "action": f"Freeze accounts: {', '.join(orchestrators)}"})
        priority += 1
    exits = ns['role_breakdown'].get('EXIT_POINT', [])
    if exits:
        actions.append({"priority": priority, "urgency": "IMMEDIATE", "action": f"Trace withdrawals from exit accounts: {', '.join(exits)}"})
        priority += 1
    actions.append({"priority": priority, "urgency": "URGENT", "action": f"Subpoena KYC records for entry point: {ns['entry_point']}"})
    priority += 1
    return actions

def generate_ring_report(rc, cross_ring_patterns):
    """Generates a text report for one ring."""
    fs = rc['financial_summary']
    ns = rc['network_structure']
    lines = [
        "FINANCIAL CRIME INVESTIGATION REPORT",
        f"Ring ID: {rc['ring_id']}",
        f"Risk Score: {rc['risk_score']}/100",
        "============================================================",
        "EXECUTIVE SUMMARY",
        f"{rc['ring_id']} is a {rc['pattern_type']} money laundering ring involving {ns['member_count']} accounts.",
        f"Laundered an estimated \u20B9{fs['estimated_laundered']:,.2f} over {fs['duration_hours']} hours.",
        "============================================================",
        "FINANCIAL ANALYSIS",
        f"External Inflow: \u20B9{fs['external_inflow']:,.2f}",
        f"Internal Circulation: \u20B9{fs['total_internal_flow']:,.2f}",
        f"Total Transactions: {fs['num_transactions']}",
        "============================================================",
        "NETWORK ANALYSIS",
        f"Entry Point: {ns['entry_point']}",
        f"Exit Point: {ns['exit_point']}",
        "Role Breakdown:"
    ]
    for role, accounts in ns['role_breakdown'].items():
        if accounts: lines.append(f"  {role:<15}: {', '.join(accounts)}")
    return "\n".join(lines)

def generate_master_report(all_ring_contexts, cross_ring_patterns):
    """Generates master report."""
    total_laundered = sum(rc['financial_summary']['estimated_laundered'] for rc in all_ring_contexts)
    lines = [
        "MASTER INVESTIGATION REPORT",
        f"Total Rings Detected: {len(all_ring_contexts)}",
        f"Total Estimated Laundered: \u20B9{total_laundered:,.2f}",
        "============================================================",
        "NETWORK-WIDE PATTERNS"
    ]
    for p in cross_ring_patterns:
        lines.append(f"\n[{p['severity']}] {p['pattern_name']}")
        lines.append(f"  {p['description']}")
    return "\n".join(lines)

def export_report_json(all_reconstructions, cross_ring_patterns, df, node_roles, node_scores):
    """
    Exports the complete investigation report as a structured JSON file.
    """
    rings_output = []
    suspicious_accounts = []
    seen_accounts = {}

    for recon in all_reconstructions:
        rc = recon['ring_context']
        trail = recon['trail']
        fs = rc['financial_summary']
        ns = rc['network_structure']

        ring_entry = {
            "ring_id": rc['ring_id'],
            "pattern_type": rc['pattern_type'],
            "risk_score": rc['risk_score'],
            "member_count": ns['member_count'],
            "financial": fs,
            "network": ns,
            "narrative": rc['narrative'],
            "investigator_actions": _build_actions(ns, rc)
        }
        rings_output.append(ring_entry)

        for acc, profile in rc['account_profiles'].items():
            if acc in seen_accounts:
                seen_accounts[acc]['ring_ids'].append(rc['ring_id'])
                continue
            entry = {
                "account_id": acc,
                "suspicion_score": profile['suspicion_score'],
                "role": profile['role'],
                "ring_ids": [rc['ring_id']],
                "financials": profile
            }
            seen_accounts[acc] = entry
            suspicious_accounts.append(entry)

    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_accounts_analyzed": len(df['sender_id'].unique()) + len(df['receiver_id'].unique()),
        "suspicious_accounts_flagged": len(suspicious_accounts),
        "fraud_rings_detected": len(rings_output),
        "total_estimated_laundered": round(sum(r['financial']['estimated_laundered'] for r in rings_output), 2)
    }

    output = {
        "summary": summary,
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings": rings_output,
        "cross_ring_patterns": cross_ring_patterns
    }

    return output

"""
ReportExporter — Central export manager for fraud investigation reports.
Produces four clean report types: Full Network, Per-Ring, Suspicious Accounts,
and Cross-Ring Patterns.
"""

import json
from datetime import datetime
from pathlib import Path


class ReportExporter:
    """
    Attach to the pipeline after reconstruction and cross-ring analysis.
    All export methods return the payload dict AND write to reports/ dir.
    """

    def __init__(self, all_ring_contexts, cross_ring_patterns, df, node_roles, node_scores):
        self.ring_contexts        = all_ring_contexts      # list of ring_context dicts
        self.cross_ring_patterns  = cross_ring_patterns
        self.df                   = df
        self.node_roles           = node_roles             # {account_id: role_str}
        self.node_scores          = node_scores            # {account_id: float 0-100}
        self.generated_at         = datetime.now().isoformat()
        self.output_dir           = Path("reports")
        self.output_dir.mkdir(exist_ok=True)

    # ── 1. Full Network Report ─────────────────────────────────────────────────
    def export_full_report(self):
        payload = {
            "report_type"        : "FULL_NETWORK_REPORT",
            "generated_at"       : self.generated_at,
            "summary"            : self._build_summary(),
            "suspicious_accounts": self._build_accounts(),
            "fraud_rings"        : self._build_all_rings(),
            "cross_ring_patterns": self._build_patterns(),
            "metadata"           : {
                "total_transactions" : len(self.df),
                "date_range_start"   : str(self.df.timestamp.min()),
                "date_range_end"     : str(self.df.timestamp.max()),
                "algorithm_version"  : "2.0",
                "detection_modules"  : [
                    "cycle_detection", "fan_in_out", "shell_chain",
                    "temporal_validation", "graph_contagion",
                    "segment_of_one", "mule_collector"
                ]
            }
        }
        self._save("full_network_report", payload)
        return payload

    # ── 2. Per-Ring Report ─────────────────────────────────────────────────────
    def export_ring_report(self, ring_id):
        rc = next((r for r in self.ring_contexts if r['ring_id'] == ring_id), None)
        if not rc:
            raise ValueError(f"Ring {ring_id} not found")

        ns = rc.get('network_structure', {})
        fs = rc.get('financial_summary', {})

        payload = {
            "report_type"  : "RING_REPORT",
            "generated_at" : self.generated_at,
            "ring_id"      : ring_id,
            "risk_score"   : rc['risk_score'],
            "pattern_type" : rc['pattern_type'],

            "executive_summary": {
                "description"        : rc.get('narrative', '').split('\n')[0],
                "total_laundered"    : fs.get('estimated_laundered', 0),
                "member_count"       : ns.get('member_count', 0),
                "duration_hours"     : fs.get('duration_hours', 0),
                "detected_techniques": rc.get('detected_patterns', []),
            },

            "financial_analysis": {
                "external_inflow"      : fs.get('external_inflow', 0),
                "internal_circulation" : fs.get('total_internal_flow', 0),
                "estimated_laundered"  : fs.get('estimated_laundered', 0),
                "total_transactions"   : fs.get('num_transactions', 0),
                "avg_transaction_size" : fs.get('avg_transaction_size', 0),
                "operation_start"      : str(fs.get('operation_start', '')),
                "operation_end"        : str(fs.get('operation_end', '')),
                "duration_hours"       : fs.get('duration_hours', 0),
            },

            "network_analysis": {
                "entry_point"   : ns.get('entry_point', 'UNKNOWN'),
                "exit_point"    : ns.get('exit_point', 'UNKNOWN'),
                "dominant_path" : ns.get('dominant_path', []),
                "member_count"  : ns.get('member_count', 0),
                "role_breakdown": {
                    role: accounts
                    for role, accounts in ns.get('role_breakdown', {}).items()
                    if accounts
                },
            },

            "account_profiles": {
                acc: {
                    **profile,
                    "suspicion_score": round(self.node_scores.get(acc, 0), 2),
                    "ml_role"        : self.node_roles.get(acc, 'UNKNOWN'),
                }
                for acc, profile in rc.get('account_profiles', {}).items()
            },

            "cross_ring_connections": rc.get('cross_ring_links', []),
            "narrative"             : rc.get('narrative', ''),
            "investigator_actions"  : self._build_actions(ns, rc),
        }
        self._save(f"ring_report_{ring_id}", payload)
        return payload

    # ── 3. Suspicious Accounts Only ────────────────────────────────────────────
    def export_suspicious_accounts(self):
        accounts = self._build_accounts()
        payload  = {
            "report_type"  : "SUSPICIOUS_ACCOUNTS",
            "generated_at" : self.generated_at,
            "total_flagged": len(accounts),
            "sorted_by"    : "suspicion_score_descending",
            "accounts"     : accounts,
        }
        self._save("suspicious_accounts", payload)
        return payload

    # ── 4. Cross-Ring Patterns Only ────────────────────────────────────────────
    def export_cross_ring_patterns(self):
        payload = {
            "report_type"    : "CROSS_RING_PATTERNS",
            "generated_at"   : self.generated_at,
            "patterns_found" : len(self.cross_ring_patterns),
            "patterns"       : self._build_patterns(),
            "ring_summary"   : [
                {
                    "ring_id"      : rc['ring_id'],
                    "pattern_type" : rc['pattern_type'],
                    "risk_score"   : rc['risk_score'],
                    "laundered"    : rc.get('financial_summary', {}).get('estimated_laundered', 0),
                }
                for rc in self.ring_contexts
            ],
        }
        self._save("cross_ring_patterns", payload)
        return payload

    # ── 5. Export All at Once ──────────────────────────────────────────────────
    def export_all(self):
        results = {}
        results['full']     = self.export_full_report()
        results['accounts'] = self.export_suspicious_accounts()
        results['patterns'] = self.export_cross_ring_patterns()
        results['rings']    = {}
        for rc in self.ring_contexts:
            ring_id = rc['ring_id']
            results['rings'][ring_id] = self.export_ring_report(ring_id)
        return results

    # ── Internal Builders ──────────────────────────────────────────────────────
    def _build_summary(self):
        total_laundered = sum(
            rc.get('financial_summary', {}).get('estimated_laundered', 0)
            for rc in self.ring_contexts
        )
        all_accounts = set(self.df.sender_id) | set(self.df.receiver_id)
        highest = max(self.ring_contexts, key=lambda r: r['risk_score'], default={})
        return {
            "total_accounts_analyzed"    : len(all_accounts),
            "suspicious_accounts_flagged": len(self._build_accounts()),
            "fraud_rings_detected"       : len(self.ring_contexts),
            "total_estimated_laundered"  : round(total_laundered, 2),
            "cross_ring_patterns_found"  : len(self.cross_ring_patterns),
            "highest_risk_ring"          : highest.get('ring_id', 'N/A'),
            "processing_time_seconds"    : 0.0,
        }

    def _build_accounts(self):
        seen     = {}
        accounts = []
        for rc in self.ring_contexts:
            for acc, profile in rc.get('account_profiles', {}).items():
                if acc in seen:
                    seen[acc]['ring_ids'].append(rc['ring_id'])
                    continue
                entry = {
                    "account_id"       : acc,
                    "suspicion_score"  : round(self.node_scores.get(acc, 0), 2),
                    "role"             : self.node_roles.get(acc, 'UNKNOWN'),
                    "ring_ids"         : [rc['ring_id']],
                    "detected_patterns": rc.get('detected_patterns', []),
                    "financials"       : {
                        "total_sent"           : profile.get('total_sent', 0),
                        "total_received"       : profile.get('total_received', 0),
                        "passthrough_pct"      : profile.get('passthrough_pct', 0),
                        "num_transactions"     : profile.get('num_transactions', 0),
                        "unique_counterparties": profile.get('unique_counterparties', 0),
                    },
                    "activity_window"  : {
                        "first_seen": str(profile.get('first_seen', '')),
                        "last_seen" : str(profile.get('last_seen', '')),
                    },
                }
                seen[acc] = entry
                accounts.append(entry)
        return sorted(accounts, key=lambda x: -x['suspicion_score'])

    def _build_all_rings(self):
        rings = []
        for rc in self.ring_contexts:
            ns = rc.get('network_structure', {})
            fs = rc.get('financial_summary', {})
            rings.append({
                "ring_id"             : rc['ring_id'],
                "pattern_type"        : rc['pattern_type'],
                "risk_score"          : rc['risk_score'],
                "member_accounts"     : list(rc.get('account_profiles', {}).keys()),
                "financial"           : fs,
                "network"             : ns,
                "detected_patterns"   : rc.get('detected_patterns', []),
                "cross_ring_links"    : rc.get('cross_ring_links', []),
                "narrative"           : rc.get('narrative', ''),
                "investigator_actions": self._build_actions(ns, rc),
            })
        return sorted(rings, key=lambda x: -x['risk_score'])

    def _build_patterns(self):
        return [
            {
                "pattern_name": p.get('pattern_name', ''),
                "severity"    : p.get('severity', ''),
                "description" : p.get('description', ''),
                "implication" : p.get('implication', ''),
                "details"     : {
                    k: v for k, v in p.items()
                    if k not in ['pattern_name', 'severity', 'description', 'implication']
                },
            }
            for p in self.cross_ring_patterns
        ]

    def _build_actions(self, ns, rc):
        actions  = []
        priority = 1
        role_breakdown = ns.get('role_breakdown', {})
        for role, urgency, template in [
            ('ORCHESTRATOR', 'IMMEDIATE', 'Freeze accounts: {}'),
            ('EXIT_POINT',   'IMMEDIATE', 'Trace withdrawals from: {}'),
            ('COLLECTOR',    'URGENT',    'Block outbound transfers from: {}'),
        ]:
            accs = role_breakdown.get(role, [])
            if accs:
                actions.append({
                    "priority": priority,
                    "urgency" : urgency,
                    "action"  : template.format(', '.join(accs))
                })
                priority += 1
        actions.append({
            "priority": priority, "urgency": "URGENT",
            "action"  : f"Subpoena KYC for entry point: {ns.get('entry_point', 'UNKNOWN')}"
        })
        priority += 1
        actions.append({
            "priority": priority, "urgency": "URGENT",
            "action"  : f"Pull full transaction history for all {ns.get('member_count', 0)} member accounts"
        })
        priority += 1
        links = rc.get('cross_ring_links', [])
        if links:
            actions.append({
                "priority": priority, "urgency": "HIGH",
                "action"  : f"Investigate connections to: {', '.join(l['ring_id'] for l in links)}"
            })
            priority += 1
        actions.append({
            "priority": priority, "urgency": "MEDIUM",
            "action"  : "File SAR (Suspicious Activity Report)"
        })
        return actions

    def _save(self, name, payload):
        ts       = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = self.output_dir / f"{name}_{ts}.json"
        with open(filename, 'w') as f:
            json.dump(payload, f, indent=2, default=str)

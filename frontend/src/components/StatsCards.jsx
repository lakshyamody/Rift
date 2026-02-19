export default function StatsCards({ summary }) {
    const cards = [
        { icon: '🌐', label: 'Accounts Analyzed', value: summary.total_accounts_analyzed, cls: 'purple' },
        { icon: '🚨', label: 'Suspicious Accounts', value: summary.suspicious_accounts_flagged, cls: 'red' },
        { icon: '💍', label: 'Fraud Rings Detected', value: summary.fraud_rings_detected, cls: 'amber' },
        { icon: '⚡', label: 'Processing Time', value: `${summary.processing_time_seconds}s`, cls: 'cyan' },
    ]

    return (
        <div className="stats-grid">
            {cards.map((c) => (
                <div key={c.label} className="stat-card">
                    <div className={`stat-icon ${c.cls}`}>{c.icon}</div>
                    <div>
                        <div className="stat-value">{c.value}</div>
                        <div className="stat-label">{c.label}</div>
                    </div>
                </div>
            ))}
        </div>
    )
}

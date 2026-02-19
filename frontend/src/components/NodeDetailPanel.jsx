function scoreClass(score) {
    if (score >= 70) return 'high'
    if (score >= 40) return 'medium'
    return 'low'
}

export default function NodeDetailPanel({ node }) {
    if (!node) {
        return (
            <div className="detail-empty">
                <span className="detail-empty-icon">🔍</span>
                <p>Click any node in the graph to view account details</p>
            </div>
        )
    }

    const sc = scoreClass(node.suspicion_score || 0)

    return (
        <div className="node-detail">
            <h3 className="node-id">
                {node.is_suspicious ? '🚨 ' : '✅ '}{node.id}
            </h3>

            <div className="score-bar-wrap">
                <div
                    className={`score-bar ${sc}`}
                    style={{ width: `${node.suspicion_score || 0}%` }}
                />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                <span>Suspicion Score</span>
                <span style={{ fontWeight: 700, color: sc === 'high' ? 'var(--accent-danger)' : sc === 'medium' ? 'var(--accent-warning)' : 'var(--accent-success)' }}>
                    {(node.suspicion_score || 0).toFixed(1)} / 100
                </span>
            </div>

            <div className="detail-row">
                <span className="detail-label">Ring ID</span>
                <span className="detail-value">{node.ring_id || '—'}</span>
            </div>
            <div className="detail-row">
                <span className="detail-label">In-degree</span>
                <span className="detail-value">{node.in_degree}</span>
            </div>
            <div className="detail-row">
                <span className="detail-label">Out-degree</span>
                <span className="detail-value">{node.out_degree}</span>
            </div>
            <div className="detail-row">
                <span className="detail-label">Total Transactions</span>
                <span className="detail-value">{node.total_transactions}</span>
            </div>
            <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value" style={{ color: node.is_suspicious ? 'var(--accent-danger)' : 'var(--accent-success)' }}>
                    {node.is_suspicious ? 'Suspicious' : 'Normal'}
                </span>
            </div>

            {node.patterns && node.patterns.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>Detected Patterns</h4>
                    <div className="tag-list">
                        {node.patterns.map(p => (
                            <span key={p} className={`tag ${p.startsWith('cycle') ? 'danger' : p.includes('fan') ? 'warning' : ''}`}>
                                {p}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function riskClass(score) {
    if (score >= 80) return 'risk-high'
    if (score >= 50) return 'risk-medium'
    return 'risk-low'
}

function patternClass(type) {
    if (type === 'cycle') return 'cycle'
    if (type === 'smurfing') return 'smurfing'
    return 'shell'
}

export default function RingTable({ rings }) {
    if (!rings || rings.length === 0) {
        return <p style={{ color: 'var(--text-muted)', padding: '1.5rem', textAlign: 'center' }}>No fraud rings detected.</p>
    }

    return (
        <div className="ring-table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Ring ID</th>
                        <th>Pattern</th>
                        <th>Members</th>
                        <th>Risk Score</th>
                        <th>Account IDs</th>
                    </tr>
                </thead>
                <tbody>
                    {rings.map((ring) => (
                        <tr key={ring.ring_id}>
                            <td><span className="ring-id-badge">{ring.ring_id}</span></td>
                            <td><span className={`pattern-badge ${patternClass(ring.pattern_type)}`}>{ring.pattern_type}</span></td>
                            <td style={{ fontWeight: 600 }}>{ring.member_accounts.length}</td>
                            <td className={`risk-cell ${riskClass(ring.risk_score)}`}>{ring.risk_score}</td>
                            <td className="members-cell" title={ring.member_accounts.join(', ')}>
                                {ring.member_accounts.join(', ')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

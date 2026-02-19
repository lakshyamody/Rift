import { useState } from 'react'
import StatsCards from '../components/StatsCards'
import GraphView from '../components/GraphView'
import RingTable from '../components/RingTable'
import NodeDetailPanel from '../components/NodeDetailPanel'

export default function ResultsPage({ data, fileName, onReset }) {
    const [selectedNode, setSelectedNode] = useState(null)

    const { result, graph } = data
    const { suspicious_accounts, fraud_rings, summary } = result

    const handleDownloadJSON = () => {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `fraud_analysis_${fileName.replace('.csv', '')}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="page">
            {/* Header */}
            <div className="results-header">
                <div>
                    <h2>Analysis Results</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                        📄 {fileName}
                    </p>
                </div>
                <div className="results-actions">
                    <button className="btn btn-success" onClick={handleDownloadJSON}>
                        ⬇ Download JSON
                    </button>
                    <button className="btn btn-outline" onClick={onReset}>
                        ↩ New Analysis
                    </button>
                </div>
            </div>

            {/* Stats */}
            <StatsCards summary={summary} />

            {/* Graph + Node Detail */}
            <div className="panel-grid" style={{ marginBottom: '1.25rem' }}>
                <div className="card">
                    <div className="card-header">
                        <h3>Transaction Graph</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {graph.nodes.length} nodes · {graph.edges.length} edges · Click node to inspect
                        </span>
                    </div>
                    <div className="graph-container">
                        <GraphView graphData={graph} onNodeClick={setSelectedNode} />
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Node Inspector</h3>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <NodeDetailPanel node={selectedNode} />
                    </div>
                </div>
            </div>

            {/* Fraud Ring Table */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div className="card-header">
                    <h3>Fraud Ring Summary</h3>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {fraud_rings.length} ring{fraud_rings.length !== 1 ? 's' : ''} detected
                    </span>
                </div>
                <RingTable rings={fraud_rings} />
            </div>

            {/* Top suspicious accounts */}
            {suspicious_accounts.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <h3>Top Suspicious Accounts</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Sorted by suspicion score (descending)
                        </span>
                    </div>
                    <div className="ring-table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Account ID</th>
                                    <th>Suspicion Score</th>
                                    <th>Ring</th>
                                    <th>Detected Patterns</th>
                                </tr>
                            </thead>
                            <tbody>
                                {suspicious_accounts.slice(0, 20).map((acc, i) => (
                                    <tr key={acc.account_id}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{acc.account_id}</td>
                                        <td>
                                            <span style={{
                                                fontWeight: 700,
                                                color: acc.suspicion_score >= 70
                                                    ? 'var(--accent-danger)'
                                                    : acc.suspicion_score >= 40
                                                        ? 'var(--accent-warning)'
                                                        : 'var(--accent-success)'
                                            }}>
                                                {acc.suspicion_score}
                                            </span>
                                        </td>
                                        <td><span className="ring-id-badge">{acc.ring_id}</span></td>
                                        <td>
                                            <div className="tag-list">
                                                {acc.detected_patterns.map(p => (
                                                    <span key={p} className={`tag ${p.startsWith('cycle') ? 'danger' : p.includes('fan') ? 'warning' : ''}`}>
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

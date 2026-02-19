import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'

const NODE_COLORS = {
    cycle: '#ef4444',
    smurfing: '#f59e0b',
    shell_network: '#06b6d4',
    suspicious: '#8b5cf6',
    normal: '#374151',
}

function getNodeColor(nodeData) {
    if (!nodeData.is_suspicious) return NODE_COLORS.normal
    const patterns = nodeData.patterns || []
    if (patterns.some(p => p.startsWith('cycle'))) return NODE_COLORS.cycle
    if (patterns.some(p => p.includes('fan'))) return NODE_COLORS.smurfing
    if (patterns.includes('shell_chain')) return NODE_COLORS.shell_network
    return NODE_COLORS.suspicious
}

const MAX_DISPLAY_NODES = 300

export default function GraphView({ graphData, onNodeClick }) {
    const containerRef = useRef(null)
    const cyRef = useRef(null)
    const [filterInfo, setFilterInfo] = useState(null)

    useEffect(() => {
        if (!graphData || !containerRef.current) return

        let { nodes, edges } = graphData
        let isFiltered = false

        // On large graphs, only show suspicious nodes + their direct neighbors
        const totalNodes = nodes.length
        if (nodes.length > MAX_DISPLAY_NODES) {
            isFiltered = true
            const suspiciousIds = new Set(nodes.filter(n => n.is_suspicious).map(n => n.id))
            const neighborIds = new Set(suspiciousIds)
            edges.forEach(e => {
                if (suspiciousIds.has(e.source)) neighborIds.add(e.target)
                if (suspiciousIds.has(e.target)) neighborIds.add(e.source)
            })
            nodes = nodes.filter(n => neighborIds.has(n.id))
            edges = edges.filter(e => neighborIds.has(e.source) && neighborIds.has(e.target))
            setFilterInfo({ shown: nodes.length, total: totalNodes })
        } else {
            setFilterInfo(null)
        }

        const cyNodes = nodes.map(n => ({
            data: {
                id: n.id,
                label: n.id.length > 12 ? n.id.slice(0, 10) + '…' : n.id,
                ...n,
                color: getNodeColor(n),
                size: n.is_suspicious ? Math.max(30, 20 + n.suspicion_score / 4) : 20,
            }
        }))

        const cyEdges = edges.map((e, i) => ({
            data: {
                id: `e${i}`,
                source: e.source,
                target: e.target,
                total_amount: e.total_amount,
                transaction_count: e.transaction_count,
            }
        }))

        if (cyRef.current) {
            cyRef.current.destroy()
        }

        const cy = cytoscape({
            container: containerRef.current,
            elements: [...cyNodes, ...cyEdges],
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': 'data(color)',
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'label': 'data(label)',
                        'color': '#f1f5f9',
                        'font-size': '9px',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'text-outline-color': '#0a0e1a',
                        'text-outline-width': '2px',
                        'border-width': 0,
                        'transition-property': 'border-width, border-color, background-color',
                        'transition-duration': '0.2s',
                    }
                },
                {
                    selector: 'node[?is_suspicious]',
                    style: {
                        'border-width': 2,
                        'border-color': 'white',
                        'border-opacity': 0.6,
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 3,
                        'border-color': '#ffffff',
                        'border-opacity': 1,
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.2,
                        'line-color': '#1e3a5f',
                        'target-arrow-color': '#1e3a5f',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 0.8,
                        'opacity': 0.7,
                    }
                },
                {
                    selector: 'edge:selected',
                    style: {
                        'line-color': '#6366f1',
                        'target-arrow-color': '#6366f1',
                        'opacity': 1,
                        'width': 2,
                    }
                },
            ],
            layout: {
                name: nodes.length <= 80 ? 'cose' : 'random',
                animate: nodes.length <= 80,
                randomize: true,
                nodeRepulsion: 6000,
                idealEdgeLength: 100,
                gravity: 0.25,
                padding: 30,
            },
            wheelSensitivity: 0.3,
        })

        cy.on('tap', 'node', (e) => {
            const nodeData = e.target.data()
            onNodeClick && onNodeClick(nodeData)
        })

        cy.on('tap', (e) => {
            if (e.target === cy) {
                onNodeClick && onNodeClick(null)
            }
        })

        cyRef.current = cy

        return () => {
            if (cyRef.current) {
                cyRef.current.destroy()
                cyRef.current = null
            }
        }
    }, [graphData])

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            {filterInfo && (
                <div style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 10,
                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', color: '#a5b4fc'
                }}>
                    🔍 Showing {filterInfo.shown} of {filterInfo.total} nodes (suspicious + neighbors)
                </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            <div className="graph-legend">
                {[
                    { color: NODE_COLORS.cycle, label: 'Cycle Ring' },
                    { color: NODE_COLORS.smurfing, label: 'Smurfing' },
                    { color: NODE_COLORS.shell_network, label: 'Shell Network' },
                    { color: NODE_COLORS.suspicious, label: 'Suspicious' },
                    { color: NODE_COLORS.normal, label: 'Normal' },
                ].map(l => (
                    <span key={l.label} className="legend-item">
                        <span className="legend-dot" style={{ background: l.color }} />
                        {l.label}
                    </span>
                ))}
            </div>
        </div>
    )
}

import { useState, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STEPS = [
    'Parsing CSV file…',
    'Building transaction graph…',
    'Detecting cycles (Johnson\'s algorithm)…',
    'Analyzing smurfing patterns…',
    'Identifying shell networks…',
    'Computing suspicion scores…',
    'Generating fraud ring assignments…',
    'Finalizing results…',
]

export default function UploadPage({ onResult }) {
    const [file, setFile] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState(0)
    const [error, setError] = useState(null)
    const inputRef = useRef()

    const handleFile = (f) => {
        if (!f || !f.name.endsWith('.csv')) {
            setError('Please upload a valid .csv file.')
            return
        }
        setFile(f)
        setError(null)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        handleFile(f)
    }

    const handleSubmit = async () => {
        if (!file) return
        setLoading(true)
        setError(null)
        setStep(0)

        // Animate steps while waiting
        let stepIdx = 0
        const interval = setInterval(() => {
            stepIdx = Math.min(stepIdx + 1, STEPS.length - 1)
            setStep(stepIdx)
        }, 700)

        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch(`${API_BASE}/api/analyze`, {
                method: 'POST',
                body: formData,
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || 'Server error')
            }
            const data = await res.json()
            clearInterval(interval)
            onResult(data, file.name)
        } catch (err) {
            clearInterval(interval)
            setError(err.message)
            setLoading(false)
        }
    }

    return (
        <div className="page">
            <div className="upload-hero">
                <h1>Follow the Money</h1>
                <p>Upload transaction data to expose hidden money muling networks through graph analysis</p>
            </div>

            {!loading ? (
                <>
                    <div
                        className={`upload-zone${dragging ? ' dragover' : ''}`}
                        onClick={() => inputRef.current.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                    >
                        <span className="upload-icon">📂</span>
                        <h3>{file ? file.name : 'Drop your CSV file here'}</h3>
                        <p>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'or click to browse — supports up to 10K transactions'}</p>
                        {file && <span className="file-selected">✓ File ready</span>}
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFile(e.target.files[0])}
                        />
                    </div>

                    {error && (
                        <div className="alert alert-error" style={{ maxWidth: 560, margin: '0 auto' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={!file}>
                            🔍 Analyze Transactions
                        </button>
                    </div>

                    <div style={{ marginTop: '3rem', maxWidth: 700, margin: '3rem auto 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
                        {[
                            { icon: '🔄', title: 'Cycle Detection', desc: 'Johnson\'s algorithm detects 3–5 hop money loops' },
                            { icon: '🐟', title: 'Smurfing Analysis', desc: 'Fan-in/fan-out patterns with 72-hour temporal windows' },
                            { icon: '🐚', title: 'Shell Networks', desc: 'Layered pass-through accounts with low activity' },
                        ].map((f) => (
                            <div key={f.title} className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{f.icon}</div>
                                <h3 style={{ marginBottom: '0.4rem', fontSize: '0.95rem' }}>{f.title}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="spinner-wrapper">
                    <div className="spinner" />
                    <div>
                        <p className="spinner-text">{STEPS[step]}</p>
                        <div style={{ marginTop: '0.75rem', height: '4px', background: 'var(--border-light)', borderRadius: '2px', width: '280px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${((step + 1) / STEPS.length) * 100}%`,
                                background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                                borderRadius: '2px',
                                transition: 'width 0.6s ease'
                            }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function Navbar({ onReset }) {
    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <div className="logo-icon">🕵️</div>
                <span>NACHT Financial Forensics</span>
                <span className="navbar-badge">2026</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {onReset && (
                    <button className="btn btn-outline" onClick={onReset} style={{ padding: '0.4rem 1rem', fontSize: '0.82rem' }}>
                        ↩ New Analysis
                    </button>
                )}
                <span>Graph Theory Track</span>
            </div>
        </nav>
    )
}

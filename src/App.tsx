const stack = [
  ['Web', 'React + TypeScript + Vite'],
  ['Native shell', 'Capacitor'],
  ['Android CI', 'GitHub Actions'],
] as const

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Starter App</span>
        </div>
        <span className="status">
          <span className="status-dot" aria-hidden="true" />
          Ready to build
        </span>
      </header>

      <main>
        <section className="hero" aria-labelledby="welcome-title">
          <p className="eyebrow">React + Capacitor starter</p>
          <h1 id="welcome-title">
            Your next app
            <br />
            <span>starts here.</span>
          </h1>
          <p className="intro">
            A clean foundation for a web-first product that can ship to Android
            when you are ready.
          </p>
          <a className="primary-action" href="#workspace">
            Explore the base
            <span aria-hidden="true">↓</span>
          </a>
        </section>

        <section
          id="workspace"
          className="workspace"
          aria-labelledby="workspace-title"
        >
          <div className="section-heading">
            <p className="eyebrow">Foundation</p>
            <h2 id="workspace-title">Small, dependable building blocks.</h2>
          </div>
          <div className="stack-grid">
            {stack.map(([label, value]) => (
              <article className="stack-card" key={label}>
                <span className="card-label">{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>Replace this screen with your product.</span>
        <span>Web first · Android ready</span>
      </footer>
    </div>
  )
}

export default App

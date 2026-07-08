export function ScanProgress() {
  return (
    <section className="empty-state" aria-live="polite">
      <div className="empty-card scanning-card">
        <div className="brand-row">
          <div className="brand-mark pulse">Fx</div>
          <div>
            <h1>Scanning</h1>
            <p>Reading local files and computing deterministic signals.</p>
          </div>
        </div>
        <div className="progress-bar"><span /></div>
      </div>
    </section>
  );
}

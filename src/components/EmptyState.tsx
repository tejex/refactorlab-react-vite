interface EmptyStateProps {
  error: string | null;
  onChoose: () => void;
}

export function EmptyState({ error, onChoose }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-live="polite">
      <div className="empty-card">
        <div className="brand-row">
          <div className="brand-mark">Fx</div>
          <div>
            <h1>Fixer</h1>
            <p>Local AI coding cost estimator</p>
          </div>
        </div>

        <button type="button" className="primary-action" onClick={onChoose}>
          Choose Project Folder
        </button>

        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </section>
  );
}

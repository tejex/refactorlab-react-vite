interface FooterActionsProps {
  exportMessage: string | null;
  onChooseAnother: () => void;
  onViewDetails: () => void;
}

export function FooterActions({ exportMessage, onChooseAnother, onViewDetails }: FooterActionsProps) {
  return (
    <footer className="footer-actions">
      <button type="button" className="secondary-action" onClick={onViewDetails}>View Details</button>
      <p>Estimates are based on deterministic repo signals. Actual AI cost depends on model, prompt, and task.</p>
      <button type="button" className="secondary-action" onClick={onChooseAnother}>Choose Another Repo</button>
      {exportMessage ? <span className="export-message">{exportMessage}</span> : null}
    </footer>
  );
}

interface MiniMetricCardProps {
  explanation: string;
  label: string;
  value: string;
  subtitle: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}

export function MiniMetricCard({ explanation, label, value, subtitle, tone = "neutral" }: MiniMetricCardProps) {
  return (
    <article className={`mini-metric-card ${tone}`}>
      <div>
        <span>{label}</span>
        <p>{subtitle}</p>
      </div>
      <div className="mini-value">
        <span className="metric-info" data-tooltip={explanation} title={explanation} tabIndex={0} aria-label={`${label}: ${explanation}`}>i</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

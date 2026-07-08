interface MetricCardProps {
  explanation: string;
  label: string;
  value: string;
  subtitle: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}

export function MetricCard({ explanation, label, value, subtitle, tone = "neutral" }: MetricCardProps) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-heading">
        <span>{label}</span>
        <span className="metric-info" data-tooltip={explanation} title={explanation} tabIndex={0} aria-label={`${label}: ${explanation}`}>i</span>
      </div>
      <strong>{value}</strong>
      <p>{subtitle}</p>
    </article>
  );
}

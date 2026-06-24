import type { EvidenceItem, ProjectEvidence } from "../../scanner/types";

export function EvidencePanel({ evidence }: { evidence: ProjectEvidence }) {
  return (
    <div>
      <p className="analysis-note">
        Legacy heuristic indicator. This is not a production-readiness or security guarantee.
      </p>
      <h4>Metrics</h4>
      <ul>
        {evidence.metrics.map((metric) => (
          <li key={metric.label}>
            <strong>{metric.label}:</strong> {metric.value}
          </li>
        ))}
      </ul>

      <EvidenceList title="Clusters" items={evidence.clusters} />
      <EvidenceList title="Files" items={evidence.topFiles} />
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: EvidenceItem[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <br />
            {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

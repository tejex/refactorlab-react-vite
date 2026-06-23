import type { CapabilityStatus, ProjectCapabilityMap } from "../../scanner/types";

export function ProjectCapabilityMapPanel({ map }: { map: ProjectCapabilityMap }) {
  return (
    <section className="analysis-card capability-map">
      <div className="capability-map-header">
        <div>
          <h3>Project Capability Map</h3>
          <p>{map.primaryLane}</p>
        </div>
        <div className="capability-summary">
          <CapabilityCount label="supported" value={map.supported} />
          <CapabilityCount label="partial" value={map.partial} />
          <CapabilityCount label="missing" value={map.missing} />
        </div>
      </div>

      <div className="capability-list">
        {map.capabilities.map((capability) => (
          <div className="capability-row" key={capability.id}>
            <div>
              <strong>{capability.label}</strong>
              <span>{capability.detail}</span>
            </div>
            <div className="capability-row-meta">
              <StatusBadge status={capability.status} />
              <span>{capability.detected.toLocaleString()} detected</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CapabilityCount({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{value.toLocaleString()}</strong> {label}
    </span>
  );
}

function StatusBadge({ status }: { status: CapabilityStatus }) {
  return <span className={`capability-status capability-status-${status}`}>{status}</span>;
}

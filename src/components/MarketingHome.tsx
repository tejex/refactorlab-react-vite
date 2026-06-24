import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ElectricBoltRoundedIcon from "@mui/icons-material/ElectricBoltRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

interface MarketingHomeProps {
  onGetStarted: () => void;
  onViewPricing: () => void;
}

const metrics = [
  ["94.8%", "Context reduction", ElectricBoltRoundedIcon, "green"],
  ["1.74M", "Context avoided", SearchRoundedIcon, "blue"],
  ["89", "Verified fixes", AutoFixHighRoundedIcon, "violet"],
] as const;

const pipeline = [
  ["Parse and index", "184 files"],
  ["Verified fixes", "89 applied"],
  ["Handoff packet", "96K tokens"],
] as const;

export function MarketingHome({ onGetStarted, onViewPricing }: MarketingHomeProps) {
  return (
    <main className="marketing-home">
      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="eyebrow">AI migration prep</p>
          <h1>Turn messy projects into verified LLM handoffs.</h1>
          <p>Parser-first cleanup before the frontier model sees your repo.</p>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={onGetStarted}>
              <PlayArrowRoundedIcon fontSize="small" />
              Run analysis
            </button>
            <button type="button" className="ghost-action" onClick={onViewPricing}>
              Pricing
            </button>
          </div>
        </div>

        <div className="product-preview" aria-label="Example Fixer analysis preview">
          <div className="preview-head">
            <div>
              <span>Example run</span>
              <strong>TokenSmith</strong>
            </div>
            <b>Measured</b>
          </div>

          <div className="metric-strip">
            {metrics.map(([value, label, Icon, tone]) => (
              <article className={`preview-metric metric-${tone}`} key={label}>
                <Icon fontSize="small" />
                <strong>{value}</strong>
                <p>{label}</p>
              </article>
            ))}
          </div>

          <article className="pipeline-preview">
            <div className="card-head">
              <h2>Verified pipeline</h2>
              <span>0 frontier calls</span>
            </div>
            <ol>
              {pipeline.map(([title, detail]) => (
                <li key={title}>
                  <CheckCircleRoundedIcon fontSize="small" />
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </section>
    </main>
  );
}

interface PricingPageProps {
  onGetStarted: () => void;
}

const plans = [
  ["Starter", "$0", "Small local scans.", "Try it"],
  ["Pro", "$19", "Private project analysis and handoff packs.", "Best fit"],
  ["Team", "Custom", "Bigger repos, shared runs, export workflows.", "Scale"],
];

export function PricingPage({ onGetStarted }: PricingPageProps) {
  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <p className="eyebrow">Pricing</p>
        <h1>Start with verified project prep.</h1>
        <p>Use parser-first analysis before paying for a frontier model to understand the whole repo.</p>
      </section>

      <section className="pricing-list">
        {plans.map(([name, price, body, tag]) => (
          <article className={`pricing-card${name === "Pro" ? " is-featured" : ""}`} key={name}>
            <div className="pricing-card-head">
              <h2>{name}</h2>
              <span>{tag}</span>
            </div>
            <strong className="pricing-price">{price}</strong>
            <p>{body}</p>
            <button type="button" className={name === "Pro" ? "primary-action" : "ghost-action"} onClick={onGetStarted}>
              Get started
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

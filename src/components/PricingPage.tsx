interface PricingPageProps {
  onGetStarted: () => void;
}

const plans = [
  ["Free", "$0", "Sample scans and small local experiments."],
  ["Pro", "$19", "Private uploads, saved reports, larger static HTML/JS projects."],
  ["Team", "Custom", "Shared workspaces, bigger repos, exportable reports later."],
];

export function PricingPage({ onGetStarted }: PricingPageProps) {
  return (
    <main className="plain-page">
      <section>
        <h1>Pricing</h1>
        <p>V1 pricing will be based on scan size, private uploads, and saved report history.</p>
      </section>

      <section className="pricing-list">
        {plans.map(([name, price, body]) => (
          <article className="panel" key={name}>
            <h2>{name}</h2>
            <p>
              <strong>{price}</strong>
            </p>
            <p>{body}</p>
            <button type="button" onClick={onGetStarted}>
              Get started
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

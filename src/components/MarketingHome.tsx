interface MarketingHomeProps {
  onGetStarted: () => void;
  onViewPricing: () => void;
}

export function MarketingHome({ onGetStarted, onViewPricing }: MarketingHomeProps) {
  return (
    <main className="plain-page">
      <section>
        <p>AI-built app rehabilitation</p>
        <h1>Clean up AI-built apps before they collapse.</h1>
        <p>
          Upload a messy React, Next.js, or static HTML/JS project. fixer.ai scans the structure, finds risky files,
          and gives you a repair path before humans or AI agents start refactoring.
        </p>
        <div className="button-row">
          <button type="button" onClick={onGetStarted}>
            Analyze your app
          </button>
          <button type="button" onClick={onViewPricing}>
            View pricing
          </button>
        </div>
      </section>

      <section>
        <h2>What the V1 scanner focuses on</h2>
        <ul>
          <li>Oversized files and components</li>
          <li>Risky React, Next.js, and static HTML/JS surfaces</li>
          <li>Repeated selectors, helpers, and UI patterns</li>
          <li>A first-pass repair path for refactoring</li>
        </ul>
      </section>
    </main>
  );
}

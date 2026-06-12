const steps = [
  {
    title: "Classify the stack",
    body: "Detect React/Vite/Supabase, static HTML/API, Next.js, Node, Firebase, or mixed repo shape.",
  },
  {
    title: "Score structural risk",
    body: "Rank giant files, duplicated UI, backend sprawl, env ambiguity, and missing agent context.",
  },
  {
    title: "Generate the repair plan",
    body: "Produce staged refactors and repo instructions so people and AI agents can safely continue.",
  },
];

export function HowItWorks() {
  return (
    <section className="how" id="how">
      {steps.map((step, index) => (
        <div key={step.title}>
          <span>{index + 1}</span>
          <strong>{step.title}</strong>
          <p>{step.body}</p>
        </div>
      ))}
    </section>
  );
}

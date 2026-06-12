import type { AgentReadiness, ProjectInput, ProjectReport, Risk, RoadmapStep, StackId, StackRule } from "./types";

const STACK_RULES: StackRule[] = [
  {
    id: "lovable-react-supabase",
    label: "React / Vite / Supabase",
    signals: ["lovable", "supabase", "vite", "react", "tailwind", "tsx"],
  },
  {
    id: "static-html-api",
    label: "Static HTML + API backend",
    signals: ["tokensmith", "static", "html", "css", "worker", "cloudflare"],
  },
  {
    id: "next-shadcn",
    label: "Next.js / shadcn",
    signals: ["next", "vercel", "shadcn", "app-router"],
  },
  {
    id: "node-service",
    label: "Node backend",
    signals: ["express", "node", "server", "api"],
  },
];

export function analyzeProject(input: ProjectInput): ProjectReport {
  const normalized = `${input.sourceName} ${input.sourceType}`.toLowerCase();
  if (normalized.includes("tokensmith")) return analyzeTokenSmith(input);

  const stacks = STACK_RULES.filter((rule) => rule.signals.some((signal) => normalized.includes(signal)));
  const primaryStack = stacks[0]?.id ?? "mixed-web-app";

  return {
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    score: scoreFor(primaryStack),
    summary: summaryFor(primaryStack),
    stacks: stacks.length ? stacks.map((stack) => stack.label) : ["Mixed web app", "Needs deeper scan"],
    risks: buildRisks(primaryStack),
    roadmap: buildRoadmap(primaryStack),
    agentReadiness: buildAgentReadiness(primaryStack),
  };
}

function analyzeTokenSmith(input: ProjectInput): ProjectReport {
  return {
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    score: 34,
    summary:
      "TokenSmith is the first real static HTML/JS fixture. The scan found 78 source files, 54,910 lines, a 5,009-line worker gateway, several 2k-4k line studio pages, and repeated static UI surfaces that should be split before any rewrite.",
    stacks: ["Static HTML + JS", "Cloudflare Worker", "Supabase", "Stripe", "Large-file fixture"],
    risks: [
      {
        severity: "High",
        title: "Worker gateway is too large",
        body: "workers/otter-api/src/index.ts is 5,009 lines and carries platform, provider, routing, billing, and storage risk in one file.",
      },
      {
        severity: "High",
        title: "Studio pages mix markup and behavior",
        body: "studio/video.html, studio/image.html, and studio/index.html are large enough that layout, state, DOM selectors, and feature flows need separate analysis.",
      },
      {
        severity: "Medium",
        title: "Repeated shell and selector patterns",
        body: "The fixture repeats static UI structure across API, studio, blog, and marketing surfaces. Shared navigation/theme extraction is likely a safe first HTML-side target.",
      },
    ],
    roadmap: [
      ["Lock the fixture", "Keep TokenSmith extracted under fixtures/tokensmith-main so every analyzer change can be rerun against the same sample."],
      ["Expand static evidence", "Add selector duplication, script load-order, DOM side-effect, and HTML-to-JS dependency mapping for the highest-risk pages."],
      ["Split by surface", "Treat studio, API dashboard, site shell, worker API, and blog content as separate clusters before recommending file moves."],
      ["Defer rewrites", "V1 should keep reporting only. The first trusted output is which page or script to split first, not an automatic edit."],
    ],
    agentReadiness: {
      score: 28,
      gaps: [
        "No fixer.ai-readable module map exists for TokenSmith yet",
        "Large HTML and worker files reduce clean retrieval targets",
        "Runtime-sensitive surfaces need explicit side-effect warnings before extraction",
      ],
    },
    evidence: {
      metrics: [
        { label: "Source files", value: "78" },
        { label: "Source lines", value: "54,910" },
        { label: "Highest-risk file", value: "workers/otter-api/src/index.ts" },
        { label: "Report", value: "reports/tokensmith-static-analysis.json" },
      ],
      clusters: [
        { title: "studio", detail: "15 files, 23,579 lines, risk 7,917" },
        { title: "api-dashboard", detail: "41 files, 14,379 lines, risk 7,434" },
        { title: "site-shell", detail: "19 files, 17,895 lines, risk 6,862" },
        { title: "worker-api", detail: "2 files, 5,026 lines, risk 2,694" },
        { title: "blog-content", detail: "5 files, 4,278 lines, risk 2,190" },
      ],
      topFiles: [
        { title: "workers/otter-api/src/index.ts", detail: "5,009 lines, risk 2,686" },
        { title: "studio/video.html", detail: "3,573 lines, risk 1,307" },
        { title: "studio/image.html", detail: "3,312 lines, risk 1,138" },
        { title: "api/video-playground.js", detail: "1,370 lines, risk 1,064" },
        { title: "blog/post.html", detail: "1,222 lines, risk 1,004" },
        { title: "chat/chat.js", detail: "1,183 lines, risk 998" },
      ],
    },
  };
}

function scoreFor(stackId: StackId): number {
  const scores: Record<StackId, number> = {
    "lovable-react-supabase": 46,
    "static-html-api": 38,
    "next-shadcn": 52,
    "node-service": 49,
    "mixed-web-app": 44,
  };
  return scores[stackId];
}

function summaryFor(stackId: StackId): string {
  const summaries: Record<StackId, string> = {
    "lovable-react-supabase":
      "This looks like a generated React/Supabase product. The first scan should focus on data boundaries, generated UI sprawl, env setup, and AI-agent context.",
    "static-html-api":
      "This looks like a static product with backend glue. The first scan should find duplicated page structure, large HTML/CSS/JS files, and oversized API handlers.",
    "next-shadcn":
      "This looks like a Next.js app. The first scan should focus on client/server boundaries, route handlers, auth, payments, and copied UI patterns.",
    "node-service":
      "This looks like a backend-heavy web app. The first scan should look for route sprawl, service boundaries, env risk, migrations, and deploy assumptions.",
    "mixed-web-app":
      "This repo needs stack classification first. fixer.ai should identify the framework, backend runtime, data provider, and deployment surface before recommending repairs.",
  };
  return summaries[stackId];
}

function buildRisks(stackId: StackId): Risk[] {
  const shared: Risk[] = [
    {
      severity: "Medium",
      title: "Missing AI-agent context",
      body: "The repo should expose commands, architecture notes, safe-edit rules, and ownership boundaries for future coding agents.",
    },
  ];

  if (stackId === "lovable-react-supabase") {
    return [
      {
        severity: "High",
        title: "Supabase boundary risk",
        body: "Auth, RLS, storage, edge functions, and client data assumptions need review before real users touch production data.",
      },
      {
        severity: "Medium",
        title: "Generated UI duplication",
        body: "Pages, forms, and tables may repeat logic because visible product progress arrived before component boundaries.",
      },
      ...shared,
    ];
  }

  if (stackId === "static-html-api") {
    return [
      {
        severity: "High",
        title: "No component model",
        body: "Repeated nav, theme, layout, scripts, and inline page structure make each new screen harder to update safely.",
      },
      {
        severity: "High",
        title: "Oversized backend gateway",
        body: "Auth, billing, provider routing, media, storage, and webhook logic may share one large blast radius.",
      },
      ...shared,
    ];
  }

  if (stackId === "next-shadcn") {
    return [
      {
        severity: "High",
        title: "Client/server confusion",
        body: "Server actions, API routes, client components, auth, and payment flows need clear boundaries.",
      },
      {
        severity: "Medium",
        title: "Copied UI components",
        body: "Generated shadcn-style screens can duplicate layout and state patterns across routes.",
      },
      ...shared,
    ];
  }

  return [
    {
      severity: "High",
      title: "Giant-file pressure",
      body: "Unrelated responsibilities may be collapsed into large files that are difficult for humans and AI agents to safely edit.",
    },
    {
      severity: "Medium",
      title: "Deployment ambiguity",
      body: "Environment variables, hosting assumptions, backend runtime, and database setup need one source of truth.",
    },
    ...shared,
  ];
}

function buildRoadmap(stackId: StackId): RoadmapStep[] {
  if (stackId === "lovable-react-supabase") {
    return [
      ["Generate AGENTS.md", "Document commands, architecture, Supabase rules, and safe-edit constraints."],
      ["Map Supabase usage", "Inventory auth, RLS assumptions, storage buckets, functions, and generated types."],
      ["Extract data access", "Move repeated Supabase calls out of page components into a clear access layer."],
      ["Split generated screens", "Break oversized routes into layout, forms, tables, and state modules."],
    ];
  }

  if (stackId === "static-html-api") {
    return [
      ["Inventory repeated UI", "Find nav, theme, layout, CSS blocks, and scripts repeated across static pages."],
      ["Split API gateway", "Separate auth, billing, provider routing, media, storage, and webhook handlers."],
      ["Create shared shell", "Extract common page structure before choosing a framework migration path."],
      ["Generate repo map", "Create AI-agent instructions for UI, API, assets, and deploy surfaces."],
    ];
  }

  return [
    ["Classify repo shape", "Detect framework, backend runtime, data provider, auth, and deployment surface."],
    ["Rank structural risk", "Score giant files, duplication, missing tests, env ambiguity, and agent-readiness gaps."],
    ["Create repair roadmap", "Separate safe automated cleanup from changes needing human review."],
    ["Generate project context", "Add instructions and architecture notes for future AI-assisted edits."],
  ];
}

function buildAgentReadiness(stackId: StackId): AgentReadiness {
  return {
    score: stackId === "static-html-api" ? 32 : stackId === "lovable-react-supabase" ? 41 : 38,
    gaps: [
      "No visible AGENTS.md or repo instruction manifest",
      "Large files reduce clean retrieval targets",
      "Architecture and deploy commands need to be explicit",
    ],
  };
}

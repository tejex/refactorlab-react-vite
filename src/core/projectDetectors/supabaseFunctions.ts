import type { ProjectRootDetector } from "../roots";
import { rootProof } from "./shared";

export const supabaseFunctionsDetector: ProjectRootDetector = {
  id: "supabase-functions",
  detect(input) {
    const functionConfig = supabaseFunctionConfig(input.fileByPath.get("supabase/config.toml")?.text ?? "");
    const roots = input.allPaths
      .filter((path) => /^supabase\/functions\/[^/]+\/index\.(ts|js|mts|mjs)$/i.test(path))
      .map((path) => {
        const name = path.split("/")[2] ?? path;
        const config = functionConfig.get(name);
        if (config?.enabled === false) return null;
        return {
          id: `root:supabase-function:${name}`,
          kind: "supabase-function" as const,
          label: name,
          path,
          domain: "production" as const,
          runtime: "deno" as const,
          proof: rootProof(
            "supabase-functions",
            config ? "Explicit Supabase function config plus function entrypoint." : "Supabase function convention.",
            config ? "supabase/config.toml" : path,
            config ? "proven" : "supported",
          ),
        };
      })
      .filter((root): root is NonNullable<typeof root> => Boolean(root));

    const diagnostics = [...functionConfig.entries()]
      .filter(([, config]) => config.enabled === false)
      .map(([name]) => ({
        detector: "supabase-functions",
        severity: "info" as const,
        message: `Supabase function "${name}" is disabled by explicit config.`,
        path: "supabase/config.toml",
      }));

    return { roots, candidates: [], preservedArtifacts: [], diagnostics };
  },
};

function supabaseFunctionConfig(text: string): Map<string, { enabled: boolean | null }> {
  const config = new Map<string, { enabled: boolean | null }>();
  let currentFunction: string | null = null;

  for (const line of text.split(/\r\n|\r|\n/)) {
    const section = line.match(/^\s*\[functions\.([^\]]+)\]\s*$/);
    if (section?.[1]) {
      currentFunction = section[1].replace(/^"|"$/g, "");
      config.set(currentFunction, { enabled: null });
      continue;
    }

    if (!currentFunction) continue;
    const enabled = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/i);
    if (enabled?.[1]) config.set(currentFunction, { enabled: enabled[1].toLowerCase() === "true" });
  }

  return config;
}

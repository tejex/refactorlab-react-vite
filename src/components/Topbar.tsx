import { supabase } from "../lib/supabase";

export type AppView = "home" | "pricing" | "auth" | "app" | "extraction-map";

interface TopbarProps {
  activeView?: AppView;
  onNavigate?: (view: AppView) => void;
  userEmail?: string;
}

export function Topbar({ activeView = "home", onNavigate, userEmail }: TopbarProps) {
  async function handleSignOut() {
    await supabase?.auth.signOut();
    onNavigate?.("home");
  }

  return (
    <header className="topbar">
      <button type="button" onClick={() => onNavigate?.("home")}>
        fixer.ai
      </button>

      <nav>
        {userEmail ? (
          <>
            <button type="button" aria-current={activeView === "home" ? "page" : undefined} onClick={() => onNavigate?.("home")}>
              Overview
            </button>
            <button type="button" aria-current={activeView === "app" ? "page" : undefined} onClick={() => onNavigate?.("app")}>
              Scan
            </button>
            <a href="#report" onClick={() => onNavigate?.("app")}>Report</a>
          </>
        ) : (
          <>
            <button type="button" aria-current={activeView === "home" ? "page" : undefined} onClick={() => onNavigate?.("home")}>
              Home
            </button>
            <button
              type="button"
              aria-current={activeView === "pricing" ? "page" : undefined}
              onClick={() => onNavigate?.("pricing")}
            >
              Pricing
            </button>
            <button type="button" onClick={() => onNavigate?.("auth")}>
              Log in
            </button>
          </>
        )}
      </nav>

      {userEmail ? (
        <div>
          <span>{userEmail}</span>
          <button type="button" onClick={handleSignOut}>
            Log out
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => onNavigate?.("auth")}>
          Get started
        </button>
      )}
    </header>
  );
}

import type { FormEvent } from "react";
import { useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!supabase) {
      setError("Add your Supabase URL and anon key to .env.local before signing in.");
      return;
    }

    setIsSubmitting(true);
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your Supabase login.");
      return;
    }

    setMessage(mode === "signin" ? "Signed in." : "Account created.");
  }

  async function handlePasswordReset() {
    setMessage(null);
    setError(null);

    if (!supabase) {
      setError("Add your Supabase URL and anon key to .env.local before resetting a password.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email first, then request a password reset.");
      return;
    }

    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset link sent. Check your email.");
  }

  return (
    <main className="plain-page">
      <section className="panel">
        <h1>{mode === "signin" ? "Log in" : "Create account"}</h1>
        <p>Use Supabase auth so scans can later be saved to your account.</p>

        <div className="button-row">
          <button type="button" onClick={() => setMode("signin")}>
            Log in
          </button>
          <button type="button" onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="error-message">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.</p>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            autoComplete="email"
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <div className="input-row">
            <input
              id="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              type={isPasswordVisible ? "text" : "password"}
              value={password}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)}>
              {isPasswordVisible ? "Hide" : "Show"}
            </button>
          </div>

          {mode === "signin" ? (
            <button type="button" disabled={isSubmitting} onClick={handlePasswordReset}>
              Forgot your password?
            </button>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Working..." : mode === "signin" ? "Log in" : "Create account"}
          </button>
        </form>

        {message ? <p className="success-message">{message}</p> : null}
        {error ? <p className="error-message">{error}</p> : null}
      </section>
    </main>
  );
}

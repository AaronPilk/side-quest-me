import { useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, KeyRound } from "lucide-react";
import { Button, Notice } from "./ui";
import "./email-password-sign-in.css";

/** Ordinary password authentication for accounts that already have a password. */
export function EmailPasswordSignIn({
  auth,
}: {
  auth: Pick<SupabaseClient["auth"], "signInWithPassword">;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestPending = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
      // App's existing auth listener establishes identity and normal routing.
      setPassword("");
    } catch {
      setError(
        "Could not sign in. Check your email and password, then try again.",
      );
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return (
    <details className="email-password-sign-in">
      <summary>
        <KeyRound size={18} aria-hidden="true" />
        <span>Sign in with password</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <form onSubmit={signIn} className="stack" aria-label="Password sign-in">
        <p className="fine-print">
          For an existing account with a password. New here? Use the email
          sign-in link above.
        </p>
        <label>
          Account email
          <input
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button type="submit" busy={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        {error && <Notice error>{error}</Notice>}
      </form>
    </details>
  );
}

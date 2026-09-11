import { FormEvent, useState } from "react";
import { authClient } from "../auth-client";
import { BrandLockup } from "../layout/BrandLockup";
import { SyncStatus } from "./SyncStatus";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);

    const result = await authClient.signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Could not sign in. Check email and password.");
      return;
    }

    sessionStorage.setItem("shift_started", new Date().toISOString());
  }

  return (
    <div className="login-page">
      <header className="topbar login-topbar">
        <BrandLockup />
        <SyncStatus />
      </header>

      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit}>
          <p className="login-kicker">Counter sign-in</p>
          <h1>Open the till</h1>
          <p className="login-lede urdu" lang="ur">
            کاؤنٹر کھولیں
          </p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            autoComplete="username"
            required
          />

          <div className="label-row">
            <label htmlFor="password">Password</label>
            <button
              type="button"
              className="text-btn"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn-tandoor" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
            <span className="urdu">{pending ? "انتظار" : "داخل ہوں"}</span>
          </button>
        </form>
      </main>
    </div>
  );
}

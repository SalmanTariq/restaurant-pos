import { FormEvent, useState } from "react";
import { authClient, clearAuthToken } from "./auth-client";
import "./App.css";

type Mode = "sign-in" | "sign-up";

function AuthForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
    }
  }

  return (
    <main className="container">
      <h1>Restaurant POS</h1>
      <p>Sign in with email and password</p>
      <form className="auth-form" onSubmit={onSubmit}>
        {mode === "sign-up" && (
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Name"
            autoComplete="name"
            required
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          placeholder="Password"
          autoComplete={
            mode === "sign-up" ? "new-password" : "current-password"
          }
          minLength={8}
          required
        />
        <button type="submit" disabled={pending}>
          {pending
            ? "Please wait..."
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setError("");
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

function SignedIn({ name, email }: { name: string; email: string }) {
  return (
    <main className="container">
      <h1>Restaurant POS</h1>
      <p>
        Signed in as <strong>{name}</strong>
      </p>
      <p>{email}</p>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          clearAuthToken();
        }}
      >
        Sign out
      </button>
    </main>
  );
}

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="container">
        <p>Loading session...</p>
      </main>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  return <SignedIn name={session.user.name} email={session.user.email} />;
}

export default App;

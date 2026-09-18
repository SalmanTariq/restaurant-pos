import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
};

export function UsersScreen() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "admin">("cashier");

  async function loadUsers() {
    try {
      const result = await api<{ users: ManagedUser[] }>("/staff");
      setUsers(result.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      await api("/staff", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("cashier");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page users-page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="subhead">Cashiers and admins who can open a shift.</p>
        </div>
      </div>

      <div className="users-layout">
        <form className="login-card users-form" onSubmit={onSubmit}>
          <h2>Add staff</h2>
          <label htmlFor="staff-name">Name</label>
          <input
            id="staff-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            autoComplete="name"
            required
          />
          <label htmlFor="staff-email">Email</label>
          <input
            id="staff-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            autoComplete="off"
            required
          />
          <label htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label htmlFor="staff-role">Role</label>
          <select
            id="staff-role"
            value={role}
            onChange={(event) =>
              setRole(event.currentTarget.value as "cashier" | "admin")
            }
          >
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </select>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn-tandoor" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create user"}
          </button>
        </form>

        <section className="top-items staff-table">
          <header>
            <h2>Staff</h2>
            <p>
              <span>Email</span>
              <span>Role</span>
            </p>
          </header>
          <ul>
            {users.map((user) => (
              <li key={user.id}>
                <span>{user.name}</span>
                <span className="sold">{user.email}</span>
                <strong>{user.role ?? "cashier"}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

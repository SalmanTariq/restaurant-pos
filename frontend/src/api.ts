const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const AUTH_TOKEN_KEY = "bearer_token";

function messageFromBody(body: { message?: unknown }) {
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(" ");
  return null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: unknown;
    };
    throw new Error(messageFromBody(body) ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

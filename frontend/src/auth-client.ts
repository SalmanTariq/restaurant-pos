import { createAuthClient } from "better-auth/react";

const TOKEN_KEY = "bearer_token";

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  fetchOptions: {
    credentials: "include",
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(TOKEN_KEY) ?? "",
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
    },
  },
});

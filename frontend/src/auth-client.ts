import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { AUTH_TOKEN_KEY } from "./api";

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  plugins: [adminClient()],
  fetchOptions: {
    credentials: "include",
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(AUTH_TOKEN_KEY) ?? "",
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      }
    },
  },
});

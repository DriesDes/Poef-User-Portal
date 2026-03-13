import type { PortalPayload, SessionPersistence } from "../types";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const fallback = "Er liep iets mis.";

    try {
      const json = (await response.json()) as { error?: string };
      throw new Error(json.error ?? fallback);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(fallback);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function loginWithCode(code: string, persistence: SessionPersistence) {
  return request<void>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ code, persistence })
  });
}

export function logout() {
  return request<void>("/api/auth/logout", {
    method: "POST"
  });
}

export function fetchPortalData() {
  return request<PortalPayload>("/api/portal/me");
}

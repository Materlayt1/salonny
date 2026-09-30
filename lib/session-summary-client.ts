export type SessionSummary = {
  authenticated: boolean;
  displayName?: string;
  city?: string | null;
  hasBusiness?: boolean;
  isAdmin?: boolean;
  unreadCount?: number;
  favoriteBusinessIds?: string[];
};

let current: { expiresAt: number; request: Promise<SessionSummary> } | undefined;

export function getSessionSummary() {
  const now = Date.now();
  if (current && current.expiresAt > now) return current.request;
  const request = fetch("/api/session-summary", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => response.ok ? await response.json() as SessionSummary : { authenticated: false })
    .catch((): SessionSummary => ({ authenticated: false }));
  current = { request, expiresAt: now + 5_000 };
  return request;
}

export function invalidateSessionSummary() {
  current = undefined;
}

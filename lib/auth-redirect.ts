export const LOGIN_NEXT_COOKIE = "sasu_login_next";

export function sanitizeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return fallback;
  }

  try {
    const base = new URL("https://sasu.internal");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function loginNextCookieValue(
  next: string | null | undefined,
): string | null {
  const safe = sanitizeInternalPath(next, "");
  if (!safe || safe === "/login" || safe.startsWith("/login/") || safe.startsWith("/auth/")) {
    return null;
  }
  return safe;
}

export function resolvePostLoginPath(input: {
  next: string | null;
  firstDeptId: string | null;
  isOrgAdmin: boolean;
  adminReadEnabled: boolean;
}): string {
  const safeNext = loginNextCookieValue(input.next);
  if (safeNext) return safeNext;
  if (input.firstDeptId) return `/d/${input.firstDeptId}`;
  if (input.isOrgAdmin && input.adminReadEnabled) return "/admin";
  return "/no-membership";
}

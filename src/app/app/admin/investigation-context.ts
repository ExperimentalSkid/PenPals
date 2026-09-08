const ADMIN_PATH = /^\/app\/admin(?:\/|$)/;

/**
 * Return paths are navigation state only. Keep them constrained to the staff
 * workspace so a query parameter can never turn a staff back link into an
 * external redirect.
 */
export function safeAdminReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || !ADMIN_PATH.test(value)) return null;
  return value;
}

export function withAdminReturnTo(href: string, returnTo: string | null | undefined): string {
  const safeReturn = safeAdminReturnTo(returnTo);
  if (!safeReturn) return href;
  const parsed = new URL(href, "http://penpal.local");
  parsed.searchParams.set("return_to", safeReturn);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function caseContextHref(caseId: string, anchor = "evidence-review"): string {
  return `/app/admin/cases/${encodeURIComponent(caseId)}#${anchor}`;
}

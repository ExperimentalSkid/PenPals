export type VerificationDisplayRecord = {
  status?: string | null;
  revoked_at?: string | null;
  reverify_after?: string | null;
};

export type VerificationDisplayState = "verified" | "needs-refresh" | "ineligible" | "not-verified";

function validReverifyAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isCurrentVerification(record: VerificationDisplayRecord, now = new Date()): boolean {
  if (record.status !== "verified" || record.revoked_at) return false;
  const reverifyAfter = validReverifyAfter(record.reverify_after);
  return reverifyAfter === null ? !record.reverify_after : reverifyAfter > now.getTime();
}

export function needsVerificationRefresh(record: VerificationDisplayRecord, now = new Date()): boolean {
  if (record.status !== "verified" || record.revoked_at || !record.reverify_after) return false;
  const reverifyAfter = validReverifyAfter(record.reverify_after);
  return reverifyAfter !== null && reverifyAfter <= now.getTime();
}

export function verificationDisplayState(records: readonly VerificationDisplayRecord[], now = new Date()): VerificationDisplayState {
  if (records.some((record) => isCurrentVerification(record, now))) return "verified";
  if (records.some((record) => needsVerificationRefresh(record, now))) return "needs-refresh";
  if (records.some((record) => record.status === "linked_not_eligible" && !record.revoked_at)) return "ineligible";
  return "not-verified";
}

export function verificationDisplayLabel(state: VerificationDisplayState): string {
  if (state === "verified") return "Verified";
  if (state === "needs-refresh") return "Needs refresh";
  if (state === "ineligible") return "Ineligible";
  return "Not verified";
}

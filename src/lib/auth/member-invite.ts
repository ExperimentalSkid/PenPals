export const MEMBER_INVITE_COOKIE = "penpals_member_invite";
export const MEMBER_INVITE_MAX_AGE = 60 * 60;

export function validMemberInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

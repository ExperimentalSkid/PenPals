// Notification types that represent an actionable item in the app shell.
// Message events intentionally remain outside this stream; conversations own
// their unread state.
export const ACTIONABLE_NOTIFICATION_TYPES = [
  "new_introduction",
  "introduction_replied",
  "introduction_declined",
  "photo_access_request",
  "photo_access_granted",
  "support_ticket_created",
  "support_ticket_user_reply",
  "support_ticket_public_reply",
  "support_ticket_waiting_user",
  "support_ticket_resolved",
  "support_ticket_reopened",
  "profile_verification_reverify",
] as const;

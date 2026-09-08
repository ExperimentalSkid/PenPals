import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ExportData = Record<string, unknown>;
type ZipFile = { name: string; content: string | Uint8Array };
type ServerClient = Awaited<ReturnType<typeof createClient>>;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: unknown[], columns: string[]): string {
  const objects = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  return [columns.join(","), ...objects.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\r\n");
}

function withoutMessages(conversation: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...conversation };
  delete copy.messages;
  return copy;
}

function u16(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value, 0);
  return bytes;
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0, 0);
  return bytes;
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: ZipFile[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = typeof file.content === "string" ? Buffer.from(file.content, "utf8") : Buffer.from(file.content);
    const checksum = crc32(content);
    const header = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(content.length), u32(content.length), u16(name.length), u16(0), name,
    ]);
    local.push(header, content);

    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += header.length + content.length;
  }

  const centralDirectory = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralDirectory.length), u32(offset), u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...local, centralDirectory, end]));
}

function buildAccessInformation(exportedAt: string) {
  return {
    generated_at: exportedAt,
    purposes_of_processing: [
      "Provide profiles, discovery, introductions, conversations, notifications, and account controls requested by the user.",
      "Protect the community, prevent abuse and spam, enforce privacy and access controls, and investigate reports.",
      "Maintain authentication, security, service reliability, and legal compliance.",
    ],
    categories_of_personal_data: [
      "Account identifiers and contact details (email, account creation and sign-in history).",
      "Profile information (username, display name, birth date, gender, location, bio, quote, looking-for, photo reference).",
      "Settings, privacy, availability, country exclusions, languages, and interests.",
      "Introductions, conversations, messages, notifications, blocks, and photo-access requests or grants.",
      "Uploaded profile photos and associated storage metadata.",
      "Activity and security history, including authentication event timestamps and IP addresses where available.",
      "Reports submitted by the user and redacted reports or moderation records concerning the user.",
    ],
    recipients_or_categories_of_recipients: [
      "Supabase authentication, database, storage, and hosting infrastructure providers.",
      "pen-pals.net operators and authorized moderators or administrators where required for safety and support.",
      "Other authenticated users, limited to profile fields and communication content the product permits them to access.",
      "Authorities or professional advisers where disclosure is required or permitted by law.",
    ],
    retention_periods_or_criteria: {
      account_and_profile: "Retained while the account is active or deactivated; removed on permanent account deletion unless a documented legal or security exception applies.",
      conversations_and_messages: "Retained while the shared conversation exists; a deleted participant is de-identified as Deleted user while the surviving participant's shared copy remains.",
      photos: "Retained until the user replaces/removes the photo or permanently deletes the account.",
      reports_and_safety_records: "User-submitted reports are exported and removed by the applicable account-erasure flow. Immutable moderation or authentication security records may be retained only for documented safety, fraud-prevention, or legal purposes; no fixed period is silently asserted where policy is not yet defined.",
      export_files: "Generated in memory for this download and not stored as a server-side archive; export request audit metadata is retained in the data-rights log.",
    },
    data_subject_rights: [
      "Access personal data and information about its processing.",
      "Correct inaccurate or incomplete personal data.",
      "Request deletion, subject to limited legal or safety retention exceptions.",
      "Restrict or object to processing where applicable.",
      "Receive portable machine-readable data supplied by the user.",
      "Withdraw consent where processing is based on consent.",
    ],
    right_to_complain_to_supervisory_authority: "You may complain to the data-protection supervisory authority in your habitual residence, place of work, or the place of the alleged infringement.",
    data_sources_not_obtained_directly_from_user: [
      "Authentication and security events generated by the authentication provider.",
      "Messages, introductions, reports, blocks, and photo-access actions created by other users or by system workflows.",
    ],
    automated_decision_making_and_profiling: "No decision with legal or similarly significant effect is made solely by automated processing. Deterministic discovery eligibility, requested filters, activity ordering, anti-spam limits, and response statistics are product rules rather than personality profiling; they may affect what is shown or which actions are available.",
    international_transfer_safeguards: "Where service providers process data internationally, transfers are subject to the provider's applicable data-processing terms and, where required, an adequacy decision, Standard Contractual Clauses, and supplementary safeguards.",
  };
}

function accessInformationText(info: ReturnType<typeof buildAccessInformation>): string {
  const lines = [
    "GDPR Article 15 access information",
    `Generated at: ${info.generated_at}`,
    "",
    "Purposes of processing",
    ...info.purposes_of_processing.map((value) => `- ${value}`),
    "",
    "Categories of personal data",
    ...info.categories_of_personal_data.map((value) => `- ${value}`),
    "",
    "Recipients or categories of recipients",
    ...info.recipients_or_categories_of_recipients.map((value) => `- ${value}`),
    "",
    "Retention periods or criteria",
    ...Object.entries(info.retention_periods_or_criteria).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Data-subject rights",
    ...info.data_subject_rights.map((value) => `- ${value}`),
    "",
    `Right to complain to a supervisory authority: ${info.right_to_complain_to_supervisory_authority}`,
    "",
    "Sources of data not obtained directly from you",
    ...info.data_sources_not_obtained_directly_from_user.map((value) => `- ${value}`),
    "",
    `Automated decision-making and profiling: ${info.automated_decision_making_and_profiling}`,
    "",
    `International-transfer safeguards: ${info.international_transfer_safeguards}`,
  ];
  return lines.join("\n");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function buildFiles(data: ExportData, accessInformation: ReturnType<typeof buildAccessInformation>): ZipFile[] {
  const conversations = asArray(data.conversations) as Array<Record<string, unknown>>;
  const messages = conversations.flatMap((conversation) => asArray(conversation.messages).map((message) => ({ conversation_id: conversation.id, ...(message as Record<string, unknown>) })));
  const photoAccess = (data.photo_access && typeof data.photo_access === "object" ? data.photo_access : {}) as Record<string, unknown>;
  const moderation = objectValue(data.moderation);
  const readme = [
    "pen-pals.net personal data export",
    "",
    "This ZIP contains data associated with your account at the time the export was generated.",
    "Categories: account, profile, settings, languages, interests, introductions, conversations, messages, notifications, photo access, blocks, photos, activity/security history, external verification links, reports you submitted, and redacted reports or moderation records concerning this account.",
    "Conversation participants are represented as self/other to protect other people's privacy; a permanently deleted participant is represented as Deleted user. Reports about this account and moderation records are included only as redacted access information; reporter identities and protected evidence are withheld.",
    "Messages are included because they are part of your communication history. Shared conversation records remain for surviving participants with deleted senders anonymized.",
    "The export is generated on demand and is not stored as a server-side archive.",
  ].join("\n");
  return [
    { name: "README.txt", content: readme },
    { name: "export.json", content: JSON.stringify(data, null, 2) },
    { name: "gdpr-access-information.txt", content: accessInformationText(accessInformation) },
    { name: "gdpr-access-information.json", content: JSON.stringify(accessInformation, null, 2) },
    { name: "account.csv", content: csv([data.account], ["email", "created_at", "last_sign_in_at", "role", "status", "deactivated_at"]) },
    { name: "profile.csv", content: csv([data.profile], ["username", "display_name", "birth_date", "gender", "country", "city", "bio", "quote", "looking_for", "avatar_path", "created_at", "updated_at"]) },
    { name: "settings.csv", content: csv([data.settings], ["profile_visibility", "show_city", "show_activity_status", "show_response_rate", "accepting_new_conversations", "introduction_scope", "availability", "deactivated_at", "country_exclusion_codes"]) },
    { name: "languages.csv", content: csv(asArray(data.languages), ["language", "proficiency", "purpose"]) },
    { name: "interests.csv", content: csv(asArray(data.interests).map((name) => ({ interest: name })), ["interest"]) },
    { name: "introductions.csv", content: csv(asArray(data.introductions), ["id", "direction", "body", "status", "created_at", "handled_at", "expires_at", "conversation_id"]) },
    { name: "conversations.csv", content: csv(conversations.map(withoutMessages), ["id", "created_at", "updated_at"]) },
    { name: "messages.csv", content: csv(messages, ["conversation_id", "id", "sender", "body", "created_at"]) },
    { name: "notifications.csv", content: csv(asArray(data.notifications), ["type", "related_id", "created_at", "read_at"]) },
    { name: "photo-requests.csv", content: csv(asArray(photoAccess.requests), ["id", "direction", "conversation_id", "status", "created_at", "updated_at"]) },
    { name: "photo-grants.csv", content: csv(asArray(photoAccess.grants), ["direction", "granted_at"]) },
    { name: "blocks.csv", content: csv(asArray(data.blocks), ["direction", "created_at"]) },
    { name: "photos.csv", content: csv(asArray(data.photos), ["path", "created_at", "metadata"]) },
    { name: "activity-security.csv", content: csv(asArray(data.activity_security), ["event", "created_at", "ip_address"]) },
    { name: "external-verification.csv", content: csv(asArray(data.external_verification), ["provider", "provider_subject_fingerprint", "status", "capabilities", "provider_account_created_at", "verified_at", "reverify_after", "revoked_at", "created_at", "updated_at"]) },
    { name: "reports-submitted.csv", content: csv(asArray(data.reports_submitted), ["target_type", "reason", "details", "created_at", "status"]) },
    { name: "reports-about.csv", content: csv(asArray(data.reports_about), ["target_type", "reason", "status", "created_at", "updated_at", "details", "details_redacted"]) },
    { name: "moderation.csv", content: csv(asArray(moderation.actions_about_account), ["action", "old_status", "new_status", "created_at", "metadata"]) },
    { name: "moderation-evidence.csv", content: csv(asArray(moderation.profile_content_evidence), ["content_type", "created_at", "previous_value", "reason"]) },
  ];
}

async function buildPhotoFiles(db: ServerClient, data: ExportData): Promise<ZipFile[]> {
  const photos = asArray(data.photos);
  const files: ZipFile[] = [];
  for (const [index, value] of photos.entries()) {
    const path = objectValue(value).path;
    if (typeof path !== "string" || !path || /^https?:\/\//i.test(path)) continue;
    const { data: blob, error } = await db.storage.from("avatars").download(path);
    if (error || !blob) throw new Error("We couldn't include your uploaded profile photo.");
    const originalName = path.split("/").pop() || `photo-${index + 1}`;
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    files.push({ name: `photos/${index + 1}-${safeName}`, content: new Uint8Array(await blob.arrayBuffer()) });
  }
  return files;
}

export async function GET() {
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");

  const { data: supplement, error: supplementError } = await db.rpc("get_my_data_export_supplement");
  if (supplementError || !supplement || typeof supplement !== "object") {
    return new Response(JSON.stringify({ error: "We couldn't prepare the access information for your export." }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const { data: payload, error } = await db.rpc("create_data_export");
  if (error || !payload || typeof payload !== "object") {
    return new Response(JSON.stringify({ error: error?.message ?? "We couldn't create your export." }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const exportPayload = payload as { request_id?: string; data?: ExportData };
  if (!exportPayload.request_id || !exportPayload.data) {
    return new Response(JSON.stringify({ error: "We couldn't create your export." }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const supplementRecord = supplement as ExportData;
  const exportData: ExportData = {
    ...exportPayload.data,
    account: { ...objectValue(exportPayload.data.account), ...objectValue(supplementRecord.account) },
    settings: { ...objectValue(exportPayload.data.settings), ...objectValue(supplementRecord.settings) },
    external_verification: asArray(supplementRecord.external_verification),
    reports_about: asArray(supplementRecord.reports_about),
    moderation: objectValue(supplementRecord.moderation),
  };
  const exportedAt = typeof exportData.exported_at === "string" ? exportData.exported_at : new Date().toISOString();
  const accessInformation = buildAccessInformation(exportedAt);
  let photoFiles: ZipFile[];
  try {
    photoFiles = await buildPhotoFiles(db, exportData);
  } catch {
    return new Response(JSON.stringify({ error: "We couldn't include your uploaded profile photo." }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const archive = zip([...buildFiles(exportData, accessInformation), ...photoFiles]);
  const { error: auditError } = await db.rpc("record_data_export_download", { export_request: exportPayload.request_id });
  if (auditError) return new Response(JSON.stringify({ error: "We couldn't finalize your export download." }), { status: 500, headers: { "content-type": "application/json" } });

  const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  return new Response(archiveBuffer, {
    status: 200,
    headers: {
      "content-type": "application/zip",
    "content-disposition": `attachment; filename="pen-pals-net-data-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStoredZip, newExportId, sanitizeEvidenceFilename, sha256Hex, stableJson, type ArchiveEntry } from "@/lib/contact-evidence-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;
type Bundle = {
  evidence?: JsonObject & {
    integrity_verified?: boolean;
    sha256?: unknown;
    capture_source?: unknown;
    snapshot?: {
      submission?: { request_metadata?: unknown };
      verification?: { request_metadata?: unknown };
    };
  };
  ticket?: JsonObject & { ticket_code?: unknown; contact_request_metadata?: unknown };
  attachments?: unknown;
  investigation?: JsonObject & { id?: unknown };
  messages?: unknown;
  retention_holds?: unknown;
  audit?: unknown;
};

function jsonEntry(name: string, value: unknown): ArchiveEntry {
  return { name, data: Buffer.from(stableJson(value), "utf8") };
}

function safeTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (authError || !uid) return new NextResponse(null, { status: 401 });
  const { data: profile, error: profileError } = await db.from("profiles").select("role,deactivated_at").eq("id", uid).maybeSingle();
  if (profileError || profile?.role !== "admin" || profile.deactivated_at) return new NextResponse(null, { status: 403 });

  const form = await request.formData();
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 1 || reason.length > 2000) return NextResponse.json({ error: "An export reason between 1 and 2,000 characters is required." }, { status: 400 });

  const { data, error } = await db.rpc("admin_get_contact_export_bundle", { ticket_uuid: id });
  if (error || !data || typeof data !== "object") return NextResponse.json({ error: error?.message ?? "Contact evidence export is unavailable." }, { status: 400 });
  const bundle = data as Bundle;
  if (bundle.evidence?.integrity_verified !== true || !bundle.evidence?.sha256) return NextResponse.json({ error: "Contact evidence integrity could not be verified." }, { status: 409 });

  const generatedAt = new Date();
  const exportId = newExportId();
  const ticketCode = String(bundle.ticket?.ticket_code ?? `CON-${id.slice(0, 8)}`);
  const attachments = Array.isArray(bundle.attachments) ? bundle.attachments : [];
  const attachmentInventory: JsonObject[] = [];
  const attachmentEntries: ArchiveEntry[] = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const item = attachments[index] as Record<string, unknown>;
    const storagePath = String(item.storage_path ?? "");
    if (!storagePath) return NextResponse.json({ error: "A referenced attachment has no storage path." }, { status: 409 });
    const downloaded = await db.storage.from("support-attachments").download(storagePath);
    if (downloaded.error || !downloaded.data) return NextResponse.json({ error: `Attachment ${String(item.id ?? index + 1)} could not be retrieved; export was not prepared.` }, { status: 409 });
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const expectedSize = Number(item.size_bytes ?? 0);
    if (!Number.isSafeInteger(expectedSize) || expectedSize !== bytes.length) return NextResponse.json({ error: `Attachment ${String(item.id ?? index + 1)} size does not match its evidence record.` }, { status: 409 });
    const exportedPath = `attachments/${String(index + 1).padStart(2, "0")}-${String(item.id ?? "file").slice(0, 8)}-${sanitizeEvidenceFilename(String(item.file_name ?? "attachment"))}`;
    const hash = sha256Hex(bytes);
    attachmentEntries.push({ name: exportedPath, data: bytes });
    attachmentInventory.push({ ...item, exported_path: exportedPath, sha256: hash, exported_size_bytes: bytes.length });
  }

  const requestMetadata = {
    immutable_submission_request_metadata: bundle.evidence?.snapshot?.submission?.request_metadata ?? null,
    immutable_verification_request_metadata: bundle.evidence?.snapshot?.verification?.request_metadata ?? null,
    current_ticket_request_metadata: bundle.ticket?.contact_request_metadata ?? null,
  };
  const summary = [
    "Pen-Pals.net Contact Investigation Evidence Export",
    "",
    `Ticket: ${ticketCode} (${id})`,
    `Investigation: ${String(bundle.investigation?.id ?? "unavailable")}`,
    `Generated UTC: ${generatedAt.toISOString()}`,
    `Exporter account: ${uid}`,
    `Export reason: ${reason}`,
    `Immutable evidence SHA-256: ${String(bundle.evidence.sha256)}`,
    `Immutable evidence integrity: ${bundle.evidence.integrity_verified === true ? "VERIFIED" : "FAILED"}`,
    `Capture source: ${String(bundle.evidence.capture_source ?? "unknown")}`,
    `Attachments embedded: ${attachmentInventory.length}`,
    "",
    "Integrity notes:",
    "- SHA256SUMS contains hashes for every packaged evidence file except SHA256SUMS itself.",
    "- The final ZIP SHA-256 and manifest SHA-256 are written to the privileged audit log after the archive is sealed.",
    "- audit-log.json therefore contains audit events through export preparation access, but not the final contact_export_prepared event for this same archive.",
    "- A backfill_existing_ticket capture source means the snapshot was reconstructed from the already-existing verified ticket rather than captured contemporaneously.",
    "",
  ].join("\n");

  const baseEntries: ArchiveEntry[] = [
    jsonEntry("original-submission.json", bundle.evidence),
    jsonEntry("ticket.json", bundle.ticket),
    jsonEntry("messages.json", bundle.messages ?? []),
    jsonEntry("request-metadata.json", requestMetadata),
    jsonEntry("investigation.json", bundle.investigation),
    jsonEntry("retention-holds.json", bundle.retention_holds ?? []),
    jsonEntry("audit-log.json", bundle.audit ?? []),
    jsonEntry("attachments/index.json", attachmentInventory),
    { name: "SUMMARY.txt", data: Buffer.from(`${summary}\n`, "utf8") },
    ...attachmentEntries,
  ];

  const fileRecords = [...baseEntries].sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({ path: entry.name, size_bytes: entry.data.length, sha256: sha256Hex(entry.data) }));
  const manifest = {
    format: "penpals-contact-evidence-export",
    format_version: 1,
    export_id: exportId,
    generated_at_utc: generatedAt.toISOString(),
    exporter_id: uid,
    export_reason: reason,
    ticket_id: id,
    ticket_code: ticketCode,
    investigation_id: bundle.investigation?.id ?? null,
    immutable_evidence_sha256: bundle.evidence.sha256,
    immutable_evidence_integrity_verified: true,
    capture_source: bundle.evidence.capture_source ?? null,
    attachment_count: attachmentInventory.length,
    audit_scope_note: "Audit entries through export-preparation evidence access. The final export-prepared event is recorded after archive sealing.",
    files: fileRecords,
  };
  const manifestEntry = jsonEntry("manifest.json", manifest);
  const manifestSha256 = sha256Hex(manifestEntry.data);
  const checksumTargets = [...baseEntries, manifestEntry].sort((a, b) => a.name.localeCompare(b.name));
  const sums = checksumTargets.map((entry) => `${sha256Hex(entry.data)}  ${entry.name}`).join("\n") + "\n";
  const archive = createStoredZip([...checksumTargets, { name: "SHA256SUMS", data: Buffer.from(sums, "utf8") }], generatedAt);
  const archiveSha256 = sha256Hex(archive);

  const { error: auditError } = await db.rpc("record_contact_evidence_audit", {
    ticket_uuid: id,
    event_action: "contact_export_prepared",
    event_reason: reason,
    event_metadata: {
      export_id: exportId,
      investigation_id: bundle.investigation?.id ?? null,
      manifest_sha256: manifestSha256,
      archive_sha256: archiveSha256,
      immutable_evidence_sha256: bundle.evidence.sha256,
      file_count: checksumTargets.length + 1,
      attachment_count: attachmentInventory.length,
    },
  });
  if (auditError) return NextResponse.json({ error: "The export could not be sealed into the audit trail." }, { status: 500 });

  const filename = `penpals-contact-${ticketCode}-${safeTimestamp(generatedAt)}.zip`;
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Evidence-Manifest-SHA256": manifestSha256,
      "X-Evidence-Archive-SHA256": archiveSha256,
    },
  });
}

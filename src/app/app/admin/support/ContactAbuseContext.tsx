type ContactMetadata = Record<string, unknown>;

function text(metadata: ContactMetadata, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function count(metadata: ContactMetadata, key: string) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) ? value : 0;
}

function nested(metadata: ContactMetadata, key: string): ContactMetadata {
  const value = metadata[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as ContactMetadata : {};
}

function offsetLabel(value: unknown) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < -840 || minutes > 840) return "Unavailable";
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function expectedTimezoneOffset(timeZone: string | null, at: unknown) {
  if (!timeZone || !at) return null;
  const date = new Date(String(at));
  if (Number.isNaN(date.getTime())) return null;
  try {
    const zoneName = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset", hour: "2-digit" })
      .formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
    if (!zoneName || zoneName === "GMT") return 0;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zoneName);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "+" ? minutes : -minutes;
  } catch {
    return null;
  }
}
function clockDelta(metadata: ContactMetadata, serverTimestamp: unknown) {
  const client = text(nested(metadata, "client_reported"), "timestamp_utc");
  if (!client || !serverTimestamp) return null;
  const clientMs = Date.parse(client);
  const serverMs = Date.parse(String(serverTimestamp));
  if (!Number.isFinite(clientMs) || !Number.isFinite(serverMs)) return null;
  return clientMs - serverMs;
}

function deltaLabel(deltaMs: number | null) {
  if (deltaMs === null) return "Unavailable";
  const seconds = deltaMs / 1000;
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(Math.abs(seconds) < 10 ? 2 : 1)} s`;
}

export default function ContactAbuseContext({ metadata, createdAt, integrity }: { metadata: ContactMetadata; createdAt: unknown; integrity: ContactMetadata | null }) {
  const client = nested(metadata, "client_reported");
  const timezone = text(client, "timezone");
  const reportedOffset = Number(client.utc_offset_minutes);
  const expectedOffset = expectedTimezoneOffset(timezone, createdAt);
  const offsetComparable = Number.isInteger(reportedOffset) && expectedOffset !== null;
  const offsetMatches = offsetComparable ? reportedOffset === expectedOffset : null;
  const languages = Array.isArray(client.languages) ? client.languages.filter((value): value is string => typeof value === "string").join(", ") : null;
  const delta = clockDelta(metadata, createdAt);

  return <section className="border-t border-black/10 pt-7" aria-labelledby="abuse-context-heading">
    <p className="admin-eyebrow">Staff-only</p>
    <h2 id="abuse-context-heading" className="section-title mt-1">Abuse context</h2>
    <p className="mt-3 text-sm leading-6 text-black/55">Network observations and browser-reported environment data are correlation signals only. They do not independently prove identity or physical location.</p>

    <div className="mt-5 space-y-6 border-t border-black/10 pt-5 text-sm">
      <section aria-labelledby="contact-integrity-context">
        <h3 id="contact-integrity-context" className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Original submission integrity</h3>
        {integrity ? <dl className="mt-3 space-y-3">
          <div><dt className="text-black/45">Integrity check</dt><dd className={`mt-1 font-medium ${integrity.integrity_verified === true ? "text-[#087456]" : "text-[#9a3412]"}`}>{integrity.integrity_verified === true ? "Verified — stored snapshot matches SHA-256" : "FAILED — stored snapshot does not match SHA-256"}</dd></div>
          <div><dt className="text-black/45">Capture provenance</dt><dd className="mt-1">{integrity.capture_source === "verification_capture" ? "Captured at email verification" : integrity.capture_source === "backfill_existing_ticket" ? "Backfilled from existing verified ticket" : "Unknown"}</dd></div>
          <div><dt className="text-black/45">Snapshot version</dt><dd className="mt-1">v{Number(integrity.snapshot_version) || "—"}</dd></div>
          <div><dt className="text-black/45">Captured at</dt><dd className="mt-1">{integrity.captured_at ? new Date(String(integrity.captured_at)).toLocaleString() : "—"}</dd></div>
          <div><dt className="text-black/45">SHA-256</dt><dd className="mt-1 break-all font-mono text-[11px]">{text(integrity, "sha256") ?? "Unavailable"}</dd></div>
        </dl> : <p className="mt-3 text-xs leading-5 text-black/45">No immutable submission snapshot is available for this ticket.</p>}
      </section>
      <section aria-labelledby="contact-verification-context"><h3 id="contact-verification-context" className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Verification</h3><dl className="mt-3 space-y-3"><div><dt className="text-black/45">Email verified</dt><dd className="mt-1 font-medium">{metadata.email_verified === true ? "Yes" : "No"}</dd></div><div><dt className="text-black/45">Verified at</dt><dd className="mt-1">{metadata.email_verified_at ? new Date(String(metadata.email_verified_at)).toLocaleString() : "—"}</dd></div><div><dt className="text-black/45">Verification client</dt><dd className="mt-1">{metadata.verification_same_client === true ? "Same network/client key" : metadata.verification_same_client === false ? "Different network/client key" : "Unknown"}</dd></div></dl></section>
      <section aria-labelledby="contact-network-context"><h3 id="contact-network-context" className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Network observations</h3><dl className="mt-3 space-y-3"><div><dt className="text-black/45">Submission IP</dt><dd className="mt-1 break-all font-mono text-xs">{text(metadata, "ip") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">IP source</dt><dd className="mt-1 text-xs">{text(metadata, "ip_source") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Verification IP</dt><dd className="mt-1 break-all font-mono text-xs">{text(metadata, "verification_ip") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Cloudflare country / Ray</dt><dd className="mt-1 break-all text-xs">{text(metadata, "cf_country") ?? "Unavailable"} · {text(metadata, "cf_ray") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">User agent</dt><dd className="mt-1 break-words text-xs">{text(metadata, "user_agent") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Client hints</dt><dd className="mt-1 break-words text-xs">{[text(metadata, "sec_ch_ua_platform"), text(metadata, "sec_ch_ua_mobile"), text(metadata, "sec_ch_ua")].filter(Boolean).join(" · ") || "Unavailable"}</dd></div><div><dt className="text-black/45">Accept-Language</dt><dd className="mt-1 break-words text-xs">{text(metadata, "accept_language") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Referrer</dt><dd className="mt-1 break-all text-xs">{text(metadata, "referer") ?? "Unavailable"}</dd></div></dl></section>

      <section aria-labelledby="contact-client-context"><h3 id="contact-client-context" className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Client-reported environment</h3><dl className="mt-3 space-y-3"><div><dt className="text-black/45">IANA timezone</dt><dd className="mt-1">{timezone ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Reported UTC offset</dt><dd className="mt-1">{offsetLabel(client.utc_offset_minutes)}</dd></div><div><dt className="text-black/45">Timezone / offset consistency</dt><dd className={`mt-1 ${offsetMatches === false ? "text-[#9a3412]" : ""}`}>{offsetMatches === true ? "Consistent with timezone rules at submission" : offsetMatches === false ? `Mismatch — timezone expected ${offsetLabel(expectedOffset)}` : "Not enough data to compare"}</dd></div><div><dt className="text-black/45">Browser clock UTC</dt><dd className="mt-1 break-all text-xs">{text(client, "timestamp_utc") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Browser clock vs server receipt</dt><dd className="mt-1">{deltaLabel(delta)}</dd></div><div><dt className="text-black/45">Language</dt><dd className="mt-1">{text(client, "language") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Language list</dt><dd className="mt-1 break-words text-xs">{languages || "Unavailable"}</dd></div><div><dt className="text-black/45">Client metadata schema</dt><dd className="mt-1">v{Number(client.schema_version) || "—"}</dd></div></dl><p className="mt-3 text-xs leading-5 text-black/45">These values are supplied by the browser and can be changed or spoofed by the sender. Compare them with network-observed data rather than treating them as location evidence.</p></section>
      <section aria-labelledby="contact-correlation-context"><h3 id="contact-correlation-context" className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Historical correlation</h3><dl className="mt-3 space-y-3"><div><dt className="text-black/45">Earlier verified submissions</dt><dd className="mt-1">Email {count(metadata, "prior_verified_email_count")} · network/client {count(metadata, "prior_verified_client_count")} · IP {count(metadata, "prior_verified_ip_count")}</dd></div><div><dt className="text-black/45">Network/client correlation hash</dt><dd className="mt-1 break-all font-mono text-[11px]">{text(metadata, "network_client_hash") ?? text(metadata, "client_key_hash") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Network hash version</dt><dd className="mt-1">v{Number(metadata.network_client_hash_version) || "legacy"}</dd></div><div><dt className="text-black/45">Browser/environment correlation hash</dt><dd className="mt-1 break-all font-mono text-[11px]">{text(metadata, "browser_environment_hash") ?? "Unavailable"}</dd></div><div><dt className="text-black/45">Browser hash version</dt><dd className="mt-1">{metadata.browser_environment_hash_version ? `v${Number(metadata.browser_environment_hash_version)}` : "Unavailable"}</dd></div><div><dt className="text-black/45">Request metadata version</dt><dd className="mt-1">v{Number(metadata.request_metadata_version) || "legacy"}</dd></div></dl></section>
    </div>
  </section>;
}

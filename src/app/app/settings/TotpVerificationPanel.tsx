"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TotpStatus = {
  enrolled: boolean;
  state: "not-enrolled" | "verified" | "grace" | "expired" | "inactive";
  factor_id?: string | null;
  reverify_after?: string | null;
  grace_until?: string | null;
  badge_visible?: boolean;
};

type FactorState = { id: string; qrCode?: string; secret?: string };

/**
 * Supabase Auth JS returns `totp.qr_code` as an SVG data URI. Keep the value
 * intact when it is already a data URI, while still supporting a raw SVG
 * payload from older/auth-compatible clients.
 */
function qrCodeDataUrl(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^data:image\//i.test(trimmed)) return trimmed;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(trimmed)}`;
}

function dateLabel(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
    : null;
}

function errorText(error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : "";
  if (/rate|too many|频率/i.test(message)) return t("app.totp.tooMany");
  if (/factor|totp|aal|challenge|verification/i.test(message)) return t("app.totp.badCode");
  return t("app.totp.unavailable");
}

export default function TotpVerificationPanel({ status }: { status: TotpStatus }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [factor, setFactor] = useState<FactorState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const verifiedTotp = factorData.totp.find((candidate) => candidate.status === "verified" && (!status.factor_id || candidate.id === status.factor_id));
      if (verifiedTotp) {
        setFactor({ id: verifiedTotp.id });
        return;
      }
      if (status.factor_id) {
        throw new Error("The enrolled factor is no longer available.");
      }
      const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "pen-pals.net profile verification" });
      if (enrollmentError || !enrollment?.totp) throw enrollmentError ?? new Error("TOTP enrollment unavailable");
      setFactor({ id: enrollment.id, qrCode: enrollment.totp.qr_code, secret: enrollment.totp.secret });
    } catch (caught) {
      setError(errorText(caught, t));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!factor || !/^\d{6}$/.test(code)) {
      setError(t("app.totp.enterCode"));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
      if (verifyError) throw verifyError;
      const { error: persistError } = await supabase.rpc("complete_profile_totp_verification", { p_factor_id: factor.id });
      if (persistError) throw persistError;
      setFactor(null);
      setCode("");
      setMessage(t("app.totp.active30"));
      router.refresh();
    } catch (caught) {
      setError(errorText(caught, t));
    } finally {
      setBusy(false);
    }
  };

  const reverifyDate = dateLabel(status.reverify_after, locale);
  const graceDate = dateLabel(status.grace_until, locale);
  const stateCopy = status.state === "verified"
    ? (reverifyDate ? t("app.totp.activeUntil", { date: reverifyDate }) : t("app.totp.active"))
    : status.state === "grace"
      ? (graceDate ? t("app.totp.graceUntil", { date: graceDate }) : t("app.totp.grace"))
      : status.state === "expired"
        ? t("app.totp.expired")
        : status.state === "inactive"
          ? t("app.totp.inactive")
          : t("app.totp.intro");

  return (
    <div className="mt-6 border-y border-black/10 py-5">
      <p className="text-sm font-medium text-primary">{t("app.totp.title")}</p>
      <p className="section-description mt-1 max-w-2xl">{stateCopy}</p>
      {message && <p role="status" aria-live="polite" className="mt-3 text-sm text-brand">{message}</p>}
      {error && <p role="alert" aria-live="assertive" className="mt-3 text-sm text-red-700">{error}</p>}

      {!factor && <button type="button" onClick={begin} disabled={busy || status.state === "inactive"} className="mt-4 rounded-md border border-[#087456] px-3 py-2 text-sm font-medium text-brand transition hover:bg-[#e7eee8] disabled:cursor-not-allowed disabled:opacity-50">{busy ? t("app.totp.preparing") : status.enrolled ? t("app.totp.reverify") : t("app.totp.setup")}</button>}

      {factor && <form onSubmit={verify} className="mt-5 max-w-xl space-y-4 rounded-lg border border-black/10 bg-white/45 p-4">
        {factor.qrCode && <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* The Auth API returns the QR as an inline SVG data URI; optimization cannot process this local secret. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCodeDataUrl(factor.qrCode)} alt={t("app.totp.qrAlt")} className="h-40 w-40 rounded-md border border-black/10 bg-white p-2" />
          <div className="text-sm leading-6 text-black/60"><p className="font-medium text-primary">{t("app.totp.scan")}</p><p className="mt-1">{t("app.totp.scanBody")}</p>{factor.secret && <p className="mt-3 break-all text-xs text-black/50">{t("app.totp.manual")} <span className="font-mono">{factor.secret}</span></p>}</div>
        </div>}
        {!factor.qrCode && <p className="text-sm text-black/60">{t("app.totp.current")}</p>}
        <label className="field-label" htmlFor="profile-totp-code">{t("app.totp.code")}<input id="profile-totp-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required className="field mt-2 block w-full" /></label>
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || code.length !== 6} className="btn-primary px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{busy ? t("app.totp.verifying") : t("app.totp.confirm")}</button><button type="button" onClick={() => { setFactor(null); setCode(""); setError(null); }} disabled={busy} className="rounded-md border border-black/15 px-4 py-2.5 text-sm text-black/65">{t("app.totp.cancel")}</button></div>
      </form>}
    </div>
  );
}

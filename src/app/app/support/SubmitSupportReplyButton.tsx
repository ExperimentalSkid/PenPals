"use client";

import { useTranslations } from "next-intl";

import { useFormStatus } from "react-dom";

export default function SubmitSupportReplyButton() {
  const t = useTranslations();
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary px-5 py-2.5 disabled:cursor-wait disabled:opacity-60">{pending ? t("app.support.sendingReply") : t("app.support.sendReply")}</button>;
}

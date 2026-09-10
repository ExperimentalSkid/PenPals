"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { blockUser, unblockUser } from "./actions";

export default function BlockControl({ blocked, id, username }: { blocked: boolean; id: string; username: string }) {
  const [confirm, setConfirm] = useState(false);
  const t = useTranslations();
  if (blocked) return <form action={unblockUser}><input type="hidden" name="blocked_id" value={id} /><button type="submit" className="rounded-xl border px-4 py-2 text-sm">{t("app.profile.unblockUser")}</button></form>;
  return confirm
    ? <form action={blockUser}><input type="hidden" name="blocked_id" value={id} /><input type="hidden" name="username" value={username} /><p className="mb-2 text-xs leading-5 text-black/60">{t("app.profile.blockConfirm")}</p><button type="submit" className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white">{t("app.profile.blockUser")}</button></form>
    : <button type="button" onClick={() => setConfirm(true)} className="rounded-xl border border-red-300 px-4 py-2 text-sm text-red-700">{t("app.profile.blockUser")}</button>;
}

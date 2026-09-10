"use client";

import { useTranslations } from "next-intl";

type NotificationSortProps = {
  activeSort: "newest" | "oldest";
  activeFilter: "all" | "unread" | "requests" | "updates";
};

export default function NotificationSort({ activeSort, activeFilter }: NotificationSortProps) {
  const t = useTranslations();
  return (
    <form method="get" className="flex items-center gap-2 text-sm text-black/55">
      {activeFilter !== "all" && <input type="hidden" name="filter" value={activeFilter} />}
      <label htmlFor="notification-sort" className="sr-only">{t("app.notifications.sort")}</label>
      <select
        id="notification-sort"
        name="sort"
        defaultValue={activeSort}
        className="field min-h-11 w-auto min-w-[142px] rounded-full border border-[#dfddd5] bg-[#fffdfa] py-2 pl-4 pr-9 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-[#087456]"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="newest">{t("app.notifications.newest")}</option>
        <option value="oldest">{t("app.notifications.oldest")}</option>
      </select>
    </form>
  );
}

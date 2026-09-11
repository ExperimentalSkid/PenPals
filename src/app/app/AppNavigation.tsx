"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

type Role = "admin" | "moderator" | "user" | null | undefined;
type IconName = "home" | "compass" | "users" | "profile" | "message" | "bell" | "settings" | "help" | "shield" | "inbox" | "chart";
type NavItem = { href: string; label: string; icon: IconName; badge?: number; badgeLabel?: string };

const mainItems: NavItem[] = [
  { href: "/app/pen-pals", label: "My Pen Pals", icon: "home" },
  { href: "/app/discover", label: "Discover", icon: "compass" },
  { href: "/app/introductions", label: "Introductions", icon: "users" },
  { href: "/app/messages", label: "Messages", icon: "message" },
  { href: "/app/notifications", label: "Notifications", icon: "bell" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
  { href: "/app/support", label: "Help & support", icon: "help" },
];

function NavIcon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[21px] w-[21px] shrink-0" {...common}>
      {name === "home" && <><path d="M4 11.2 12 4l8 7.2" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></>}
      {name === "compass" && <><circle cx="12" cy="12" r="8.5" /><path d="m14.8 9.2-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7Z" /></>}
      {name === "users" && <><circle cx="9" cy="8" r="3" /><path d="M3.8 19c.5-3 2.2-4.5 5.2-4.5s4.7 1.5 5.2 4.5" /><path d="M15.5 5.5a3 3 0 0 1 0 5.8M16.1 14.7c2.2.4 3.5 1.8 4.1 4.3" /></>}
      {name === "profile" && <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.7-3.4 3-5.2 7-5.2s6.3 1.8 7 5.2" /></>}
      {name === "message" && <><path d="M5 18.5 3.5 21l3.9-1.4A9 9 0 1 0 5 18.5Z" /><path d="M8 10.5h8M8 14h5" /></>}
      {name === "bell" && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>}
      {name === "help" && <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.2a2.4 2.4 0 1 1 4.1 1.7c-.9.8-1.8 1.2-1.8 2.6" /><path d="M12 17h.01" /></>}
      {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H4a1.8 1.8 0 0 1 0-3h.2a1.8 1.8 0 0 0 .9-3L5 5.9a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9V2.4a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3h-.2a1.8 1.8 0 0 0-1.2 3Z" /></>}
      {name === "shield" && <><path d="M12 3 20 6v5.5c0 4.7-3.1 7.8-8 9.5-4.9-1.7-8-4.8-8-9.5V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}
      {name === "inbox" && <><path d="M4 5h16v14H4z" /><path d="M4 14h4l1.4 2h5.2L16 14h4" /><path d="M8 9h8" /></>}
      {name === "chart" && <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></>}
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  // The Admin Center link is a landing page, not a parent route. Keeping it
  // exact-match prevents both Admin and a nested staff destination (for
  // example Analytics) from appearing active at the same time.
  return pathname === href || (href !== "/app/admin" && pathname.startsWith(`${href}/`));
}

function CountBadge({ count, label }: { count?: number; label: string }) {
  if (!count || count < 1) return null;
  const value = count > 99 ? "99+" : String(count);
  return <span className="app-nav-badge" aria-label={`${value} ${label}`}>{value}</span>;
}

function Item({ item, pathname, mobile = false }: { item: NavItem; pathname: string; mobile?: boolean }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`app-nav-item ${active ? "app-nav-item-active" : ""} ${mobile ? "app-nav-item-mobile" : ""}`}
    >
      <NavIcon name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <CountBadge count={item.badge} label={item.badgeLabel ?? "unread"} />
    </Link>
  );
}

export default function AppNavigation({ unreadCount, modInboxCount, supportInboxCount, contactInboxCount, role, mobile = false }: { unreadCount: number; modInboxCount: number; supportInboxCount: number; contactInboxCount: number; role: Role; mobile?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations();
  const labels: Record<string, string> = { "My Pen Pals": t("app.nav.penPals"), Discover: t("app.nav.discover"), Introductions: t("app.nav.introductions"), Messages: t("app.nav.messages"), Notifications: t("app.nav.notifications"), Settings: t("app.nav.settings"), "Help & support": t("app.nav.support") };
  const items = mainItems.map((item) => ({ ...item, label: labels[item.label] ?? item.label, ...(item.href === "/app/notifications" ? { badge: unreadCount, badgeLabel: t("app.nav.unreadNotifications") } : {}) }));
  if (mobile) {
    const staffItems: NavItem[] = [
      { href: "/app/profile/setup", label: t("app.nav.profile"), icon: "profile" },
      ...(role === "admin" ? [{ href: "/app/admin", label: "Admin", icon: "shield" as const }] : []),
      ...(role === "moderator" ? [{ href: "/app/moderation", label: "Moderator", icon: "shield" as const }] : []),
      ...(role === "admin" ? [{ href: "/app/admin/inbox", label: "Admin Inbox", icon: "inbox" as const }] : []),
      ...(role === "admin" || role === "moderator" ? [{ href: "/app/admin/cases", label: "Mod Inbox", icon: "inbox" as const, badge: modInboxCount, badgeLabel: "open moderation cases" }] : []),
      ...(role === "admin" || role === "moderator" ? [{ href: "/app/admin/support", label: "Support Inbox", icon: "inbox" as const, badge: supportInboxCount, badgeLabel: "open support tickets" }] : []),
      ...(role === "admin" || role === "moderator" ? [{ href: "/app/admin/contact", label: "Contact Inbox", icon: "inbox" as const, badge: contactInboxCount, badgeLabel: "open contact messages" }] : []),
      ...(role === "admin" || role === "moderator" ? [{ href: "/app/admin/analytics", label: "Analytics", icon: "chart" as const }] : []),
    ];
    return <nav aria-label={t("app.nav.mobile")} className="app-mobile-nav">{[...items, ...staffItems].map((item) => <Item key={item.href} item={item} pathname={pathname} mobile />)}</nav>;
  }
  return <nav aria-label={t("app.nav.mainNav")} className="app-sidebar-nav"><p className="app-nav-label">{t("app.nav.main")}</p><div className="space-y-1">{items.map((item) => <Item key={item.href} item={item} pathname={pathname} />)}</div>{(role === "admin" || role === "moderator") && <><p className="app-nav-label app-nav-label-staff">Staff workspace</p><div className="space-y-1">{role === "admin" && <><Item item={{ href: "/app/admin", label: "Admin", icon: "shield" }} pathname={pathname} /><Item item={{ href: "/app/admin/inbox", label: "Admin Inbox", icon: "inbox" }} pathname={pathname} /></>}{role === "moderator" && <Item item={{ href: "/app/moderation", label: "Moderator", icon: "shield" }} pathname={pathname} />}{<Item item={{ href: "/app/admin/cases", label: "Mod Inbox", icon: "inbox", badge: modInboxCount, badgeLabel: "open moderation cases" }} pathname={pathname} />}<Item item={{ href: "/app/admin/support", label: "Support Inbox", icon: "inbox", badge: supportInboxCount, badgeLabel: "open support tickets" }} pathname={pathname} /><Item item={{ href: "/app/admin/contact", label: "Contact Inbox", icon: "inbox", badge: contactInboxCount, badgeLabel: "open contact messages" }} pathname={pathname} /><Item item={{ href: "/app/admin/analytics", label: "Analytics", icon: "chart" }} pathname={pathname} /></div></>}</nav>;
}

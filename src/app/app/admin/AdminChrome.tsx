import Link from "next/link";

export type AdminSection = "overview" | "cases" | "admin-inbox" | "support" | "analytics" | "reports" | "users" | "age-appeals" | "audit" | "rules";

const links: Array<{ id: AdminSection; label: string; href: string }> = [
  { id: "overview", label: "Overview", href: "/app/admin" },
  { id: "cases", label: "Mod Inbox", href: "/app/admin/cases" },
  { id: "admin-inbox", label: "Admin Inbox", href: "/app/admin/inbox" },
  { id: "support", label: "Support Inbox", href: "/app/admin/support" },
  { id: "analytics", label: "Analytics", href: "/app/admin/analytics" },
  { id: "reports", label: "Reports", href: "/app/admin/reports" },
  { id: "users", label: "Users", href: "/app/admin/users" },
  { id: "age-appeals", label: "Age appeals", href: "/app/admin/age-appeals" },
  { id: "audit", label: "Audit log", href: "/app/admin/audit" },
  { id: "rules", label: "Rules", href: "/app/admin/moderation-rules" },
];

export function AdminNav({ active, showRules = true, isAdmin = showRules }: { active: AdminSection; showRules?: boolean; isAdmin?: boolean }) {
  // Queue pages are intentionally reached from the main app's staff workspace
  // links. Keeping them out of this secondary bar avoids two competing entry
  // points while retaining the queue routes themselves.
  const inboxSections = new Set<AdminSection>(["cases", "admin-inbox", "support"]);
  return (
    <nav aria-label="Admin Center" className="admin-nav">
      <div className="flex min-w-max items-center gap-1">
        {links.filter((item) => (showRules || item.id !== "rules") && (isAdmin || item.id !== "admin-inbox") && !inboxSections.has(item.id)).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={`admin-nav-link ${active === item.id ? "admin-nav-link-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function AdminHeader({
  active,
  eyebrow,
  title,
  description,
  backHref = "/app/admin",
  backLabel = "Admin Center",
  isAdmin = false,
  showNav = false,
  children,
}: {
  active: AdminSection;
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  isAdmin?: boolean;
  showNav?: boolean;
  children?: React.ReactNode;
}) {
  const displayTitle = active === "cases" && title === "Cases" ? "Mod Inbox" : title;
  const displayBackLabel = active === "cases" && backLabel === "Cases" ? "Mod Inbox" : backLabel;
  const displayDescription = active === "cases" && description === "One investigation can hold several related reports, with ownership and history kept together."
    ? "Review moderation investigations, related reports, ownership, and history in one place."
    : description;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href={backHref} className="admin-back-link">← {displayBackLabel}</Link>
        <span className="admin-access-label">Staff workspace</span>
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="admin-eyebrow">{eyebrow}</p>
          <h1 className="admin-title">{displayTitle}</h1>
          <p className="admin-description">{displayDescription}</p>
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
      {showNav ? <AdminNav active={active} showRules={isAdmin} isAdmin={isAdmin} /> : null}
    </>
  );
}

export function AdminPage({ children }: { children: React.ReactNode }) {
  return <main className="admin-page"><div className="admin-content">{children}</div></main>;
}

export function StatusChip({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  return <span className={`admin-status admin-status-${tone}`}>{value.replaceAll("_", " ")}</span>;
}

export function toneForStatus(status: string): "neutral" | "good" | "warn" | "danger" {
  if (["resolved", "dismissed", "approved", "actioned", "active", "complete", "enabled"].includes(status)) return "good";
  if (["new", "pending", "triage", "reviewing", "investigating", "waiting"].includes(status)) return "warn";
  if (["deactivated", "rejected", "disabled"].includes(status)) return "danger";
  return "neutral";
}

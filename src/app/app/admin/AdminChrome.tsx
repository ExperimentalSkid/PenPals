import Link from "next/link";

export type AdminSection = "overview" | "cases" | "admin-inbox" | "support" | "contact" | "analytics" | "system" | "privacy-retention" | "email" | "security" | "settings" | "reports" | "users" | "staff" | "age-appeals" | "audit" | "rules";

const links: Array<{ id: AdminSection; label: string; href: string }> = [
  { id: "overview", label: "Overview", href: "/app/admin" },
  { id: "cases", label: "Mod Inbox", href: "/app/admin/cases" },
  { id: "admin-inbox", label: "Admin Inbox", href: "/app/admin/inbox" },
  { id: "support", label: "Support Inbox", href: "/app/admin/support" },
  { id: "contact", label: "Contact Inbox", href: "/app/admin/contact" },
  { id: "analytics", label: "Analytics", href: "/app/admin/analytics" },
  { id: "system", label: "System", href: "/app/admin/system" },
  { id: "privacy-retention", label: "Privacy & Retention", href: "/app/admin/privacy-retention" },
  { id: "email", label: "Email", href: "/app/admin/email" },
  { id: "security", label: "Security", href: "/app/admin/security" },
  { id: "settings", label: "Settings", href: "/app/admin/settings" },
  { id: "reports", label: "Reports", href: "/app/admin/reports" },
  { id: "users", label: "Users", href: "/app/admin/users" },
  { id: "staff", label: "Staff", href: "/app/admin/staff" },
  { id: "age-appeals", label: "Age appeals", href: "/app/admin/age-appeals" },
  { id: "audit", label: "Audit log", href: "/app/admin/audit" },
  { id: "rules", label: "Rules", href: "/app/admin/moderation-rules" },
];

export function AdminNav({ active, showRules = true }: { active: AdminSection; showRules?: boolean }) {
  return (
    <nav aria-label="Admin Center" className="admin-nav">
      <div className="flex min-w-max items-center gap-1">
        {links.filter((item) => !["cases", "admin-inbox", "support", "contact"].includes(item.id) && (showRules || item.id !== "rules")).map((item) => (
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
  showNav = isAdmin,
  accessLabel = "Staff workspace",
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
  accessLabel?: string;
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
        <span className="admin-access-label">{accessLabel}</span>
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="admin-eyebrow">{eyebrow}</p>
          <h1 className="admin-title">{displayTitle}</h1>
          <p className="admin-description">{displayDescription}</p>
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>
      {showNav ? <AdminNav active={active} showRules={isAdmin} /> : null}
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

import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";

type StaffUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "moderator";
  deactivated_at: string | null;
  last_active_at: string | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}
function parseStaff(value: unknown, role: "admin" | "moderator"): StaffUser[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const user = asRecord(item);
    return {
      id: asString(user.id),
      username: asString(user.username),
      display_name: asString(user.display_name),
      role,
      deactivated_at: asNullableString(user.deactivated_at),
      last_active_at: asNullableString(user.last_active_at),
    };
  }).filter((user) => user.id);
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function StaffSection({ title, users }: { title: string; users: StaffUser[] }) {
  return <section className="admin-section"><h2 className="admin-section-title">{title}</h2><div className="admin-table mt-4">
    {users.length ? users.map((user) => <Link key={user.id} href={`/app/admin/users/${user.id}`} className="admin-row block hover:text-brand">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-medium">{user.display_name || user.username}</p><p className="mt-1 text-xs text-black/45">@{user.username}</p></div>
      <div className="flex flex-wrap items-center gap-2 text-xs"><StatusChip value={user.role} tone={user.role === "admin" ? "good" : "neutral"} /><StatusChip value={user.deactivated_at ? "deactivated" : "active"} tone={user.deactivated_at ? "danger" : "good"} /><span className="text-black/45">Last active {dateLabel(user.last_active_at)}</span></div></div>
    </Link>) : <p className="p-6 text-sm text-black/50">No {title.toLowerCase()} found.</p>}
  </div></section>;
}

export default async function AdminStaff() {
  const { db } = await requireAdmin();
  const [adminsResult, moderatorsResult] = await Promise.all([
    db.rpc("admin_list_users_page", { search_query: null, status_filter: "all", role_filter: "admin", completeness_filter: "all", page_size: 100, page_offset: 0 }),
    db.rpc("admin_list_users_page", { search_query: null, status_filter: "all", role_filter: "moderator", completeness_filter: "all", page_size: 100, page_offset: 0 }),
  ]);
  const admins = parseStaff(adminsResult.data, "admin");
  const moderators = parseStaff(moderatorsResult.data, "moderator");
  const loadError = adminsResult.error || moderatorsResult.error;

  return <AdminPage>
    <AdminHeader isAdmin showNav active="staff" eyebrow="Administration · Access" title="Staff" description="Review administrator and moderator accounts and open their existing account controls." />
    {loadError && <p role="alert" className="notice notice-error mt-6">Staff accounts could not be fully loaded.</p>}
    <div className="mt-8 grid gap-8 lg:grid-cols-2"><StaffSection title="Administrators" users={admins} /><StaffSection title="Moderators" users={moderators} /></div>
  </AdminPage>;
}

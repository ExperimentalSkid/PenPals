import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";

type AdminUser = {
  id: string;
  username: string;
  display_name: string;
  birth_date: string | null;
  city: string | null;
  country: string | null;
  role: string;
  profile_complete: boolean;
  deactivated_at: string | null;
  last_active_at: string | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function parseUsers(value: unknown): AdminUser[] {
  if (!Array.isArray(value)) return [];
  return value.map((item): AdminUser => {
    const user = asRecord(item);
    return {
      id: asString(user.id),
      username: asString(user.username),
      display_name: asString(user.display_name),
      birth_date: asNullableString(user.birth_date),
      city: asNullableString(user.city),
      country: asNullableString(user.country),
      role: asString(user.role),
      profile_complete: asBoolean(user.profile_complete),
      deactivated_at: asNullableString(user.deactivated_at),
      last_active_at: asNullableString(user.last_active_at),
    };
  });
}

function ageFor(date: string | null) {
  if (!date) return null;
  const birth = new Date(date);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() - ((now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) ? 1 : 0);
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

const PAGE_SIZE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; role?: string; completeness?: string; page?: string; error?: string }> }) {
  const { db } = await requireAdmin();
  const filters = await searchParams;
  const status = filters.status === "active" || filters.status === "deactivated" ? filters.status : "all";
  const role = filters.role === "user" || filters.role === "moderator" || filters.role === "admin" ? filters.role : "all";
  const completeness = filters.completeness === "complete" || filters.completeness === "incomplete" ? filters.completeness : "all";
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const { data: rawUsers, error } = await db.rpc("admin_list_users_page", {
    search_query: filters.q?.trim() || null,
    status_filter: status,
    role_filter: role,
    completeness_filter: completeness,
    page_size: PAGE_SIZE,
    page_offset: (page - 1) * PAGE_SIZE,
  });
  const users = parseUsers(rawUsers);
  const firstUser = Array.isArray(rawUsers) && rawUsers.length ? asRecord(rawUsers[0]) : {};
  const total = Number(firstUser.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (status !== "all") query.set("status", status);
    if (role !== "all") query.set("role", role);
    if (completeness !== "all") query.set("completeness", completeness);
    query.set("page", String(nextPage));
    return `/app/admin/users?${query.toString()}`;
  };

  return <AdminPage>
      <AdminHeader isAdmin active="users" eyebrow="Administration · Directory" title="Users" description="Search account context, profile completeness, and access roles." />
      <form className="admin-toolbar grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-end">
        <div><label htmlFor="admin-user-search" className="text-sm text-black/60">Search username or display name</label><input id="admin-user-search" name="q" defaultValue={filters.q ?? ""} className="field mt-2 w-full" placeholder="Username or display name" /></div>
        <label className="text-sm text-black/60">Status<select name="status" defaultValue={filters.status ?? ""} className="field mt-2 w-full"><option value="">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option></select></label>
        <label className="text-sm text-black/60">Role<select name="role" defaultValue={filters.role ?? ""} className="field mt-2 w-full"><option value="">All roles</option><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label>
        <label className="text-sm text-black/60">Profile<select name="completeness" defaultValue={filters.completeness ?? ""} className="field mt-2 w-full"><option value="">All profiles</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></select></label>
        <button className="btn-primary px-4 py-2.5 text-sm">Apply filters</button>
      </form>
      {filters.error && <p role="alert" className="mt-5 border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-800">{filters.error}</p>}
      {error && <p role="alert" className="mt-5 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700">The administrator user directory could not be loaded.</p>}
      <section className="admin-section mt-8" aria-label="Users">
        {users.length ? <div className="admin-table">
          <div className="admin-table-head md:grid md:grid-cols-[minmax(0,1fr)_auto]"><span>User</span><span>Role · state · activity</span></div>
          {users.map((user) => <Link key={user.id} href={`/app/admin/users/${user.id}`} className="admin-row block hover:text-[#075d46]">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0"><p className="font-serif text-2xl text-[#10231d]">{user.display_name || user.username}</p><p className="mt-1 text-sm text-black/55">@{user.username}{ageFor(user.birth_date) !== null ? ` · ${ageFor(user.birth_date)}` : ""}{user.city ? ` · ${user.city}` : ""}{user.country ? `, ${user.country}` : ""}</p></div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-right text-xs text-black/50"><StatusChip value={user.role} tone={user.role === "admin" ? "good" : "neutral"} /><StatusChip value={user.profile_complete ? "complete" : "incomplete"} tone={user.profile_complete ? "good" : "warn"} /><StatusChip value={user.deactivated_at ? "deactivated" : "active"} tone={user.deactivated_at ? "danger" : "good"} /><span>Last active {dateLabel(user.last_active_at)}</span></div>
            </div>
          </Link>)}
        </div> : <p className="border-t border-black/10 py-10 text-sm text-black/50">No users match these filters.</p>}
      </section>
      <nav className="mt-8 flex items-center justify-between border-t border-black/10 pt-5 text-sm" aria-label="User pagination"><span className="text-black/50">Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 && <Link href={linkFor(page - 1)} className="text-[#087456] hover:underline">Previous</Link>}{page < pageCount && <Link href={linkFor(page + 1)} className="text-[#087456] hover:underline">Next</Link>}</div></nav>
  </AdminPage>;
}

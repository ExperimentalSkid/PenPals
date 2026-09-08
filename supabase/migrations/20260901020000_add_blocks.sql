create table public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.profile_blocks enable row level security;
create policy "Users can read own blocks" on public.profile_blocks for select to authenticated using ((select auth.uid()) = blocker_id);
create policy "Users can manage own blocks" on public.profile_blocks for all to authenticated using ((select auth.uid()) = blocker_id) with check ((select auth.uid()) = blocker_id);

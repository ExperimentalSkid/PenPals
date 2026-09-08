-- Minimal profile badge foundation.
--
-- Badge definitions are the single database vocabulary used by assignment
-- and read APIs. Verified is intentionally derived from the existing TOTP /
-- external-verification projection and is never stored as an assignment.

create table if not exists public.profile_badge_definitions (
  badge_key text primary key check (badge_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  icon text not null check (icon in ('check', 'star', 'people', 'leaf', 'globe', 'pin', 'calendar', 'heart')),
  tone text not null check (tone ~ '^[a-z][a-z0-9-]{1,79}$'),
  is_system_derived boolean not null default false,
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

comment on table public.profile_badge_definitions is
  'Canonical profile badge vocabulary and presentation metadata.';

insert into public.profile_badge_definitions (badge_key, label, icon, tone, is_system_derived, sort_order)
values
  ('verified', 'Verified', 'check', 'verified', true, 10),
  ('early-member', 'Early Member', 'star', 'early-member', false, 20),
  ('helpful-penpal', 'Helpful Penpal', 'people', 'helpful-penpal', false, 30),
  ('community-contributor', 'Community Contributor', 'leaf', 'community-contributor', false, 40),
  ('language-exchange', 'Language Exchange', 'globe', 'language-exchange', false, 50),
  ('local-guide', 'Local Guide', 'pin', 'local-guide', false, 60),
  ('event-host', 'Event Host', 'calendar', 'event-host', false, 70),
  ('kind-presence', 'Kind Presence', 'heart', 'kind-presence', false, 80)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order;

alter table public.profile_badge_definitions enable row level security;
revoke all on table public.profile_badge_definitions from public, anon, authenticated;

create table if not exists public.profile_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null references public.profile_badge_definitions(badge_key) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

comment on table public.profile_badges is
  'Active, explicitly assigned profile badges. Derived badges are never stored here.';

create index if not exists profile_badges_badge_key_idx
  on public.profile_badges (badge_key, assigned_at desc);

alter table public.profile_badges enable row level security;
revoke all on table public.profile_badges from public, anon, authenticated;

create or replace function public.prevent_derived_profile_badge_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.profile_badge_definitions d
     where d.badge_key = new.badge_key
       and d.is_system_derived
  ) then
    raise exception 'This profile badge is derived and cannot be assigned manually';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_derived_profile_badge_assignment() from public, anon, authenticated;

drop trigger if exists profile_badges_derived_guard on public.profile_badges;
create trigger profile_badges_derived_guard
before insert or update of badge_key on public.profile_badges
for each row execute function public.prevent_derived_profile_badge_assignment();

-- Return only the small public projection needed by a profile surface. The
-- function checks the same profile visibility boundary as other public data,
-- and never returns assignment actor, audit reason, or internal metadata.
create or replace function public.get_profile_badges(target_user uuid)
returns table (
  badge_key text,
  label text,
  icon text,
  tone text,
  is_derived boolean,
  assigned_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  return query
  select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz
    from public.profile_badge_definitions d
   where d.badge_key = 'verified'
     and public.is_profile_verified(target_user)
  union all
  select d.badge_key, d.label, d.icon, d.tone, false, b.assigned_at
    from public.profile_badges b
    join public.profile_badge_definitions d on d.badge_key = b.badge_key
   where b.user_id = target_user
     and not d.is_system_derived
  order by 1;
end;
$$;

revoke all on function public.get_profile_badges(uuid) from public, anon;
grant execute on function public.get_profile_badges(uuid) to authenticated;

-- Staff assignment/removal is one audited, server-authorized mutation path.
-- Moderators and administrators can manage explicit community badges; the
-- existing verification/TOTP RPC remains the only way to renew Verified.
create or replace function public.set_profile_badge(
  target_user uuid,
  badge_key_input text,
  should_assign boolean,
  change_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_key text := lower(btrim(badge_key_input));
  clean_reason text := nullif(btrim(change_reason), '');
  derived boolean;
  changed boolean := false;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if target_user is null or clean_key is null or should_assign is null then
    raise exception 'A target, badge, and action are required';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A moderation reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('penpal-profile-badge', 0));

  select d.is_system_derived
    into derived
    from public.profile_badge_definitions d
   where d.badge_key = clean_key;
  if not found then
    raise exception 'Unknown profile badge';
  end if;
  if derived then
    raise exception 'Verified is controlled by the existing verification flow';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user) then
    raise exception 'User not found';
  end if;

  if should_assign then
    insert into public.profile_badges (user_id, badge_key, assigned_by)
    values (target_user, clean_key, auth.uid())
    on conflict (user_id, badge_key) do nothing;
    changed := found;
  else
    delete from public.profile_badges
     where user_id = target_user
       and badge_key = clean_key;
    changed := found;
  end if;

  if changed then
    insert into public.moderation_audit_log (
      moderator_id, target_user_id, action, metadata
    ) values (
      auth.uid(), target_user,
      case when should_assign then 'profile_badge_assigned' else 'profile_badge_removed' end,
      jsonb_build_object(
        'badge_key', clean_key,
        'reason', clean_reason,
        'assigned', should_assign
      )
    );
  end if;

  return should_assign;
end;
$$;

revoke all on function public.set_profile_badge(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_profile_badge(uuid, text, boolean, text) to authenticated;

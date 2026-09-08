-- Correctness remediation: keep discovery eligibility in the privacy-aware
-- database query, record the actual introduction decision time, and resolve
-- conversation identities independently of discovery eligibility.

alter table public.conversation_introductions
  add column if not exists handled_at timestamptz;

create index if not exists introductions_recipient_handled_idx
  on public.conversation_introductions (recipient_id, status, handled_at, created_at desc);

create or replace function public.set_introduction_handled_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'pending' and new.status in ('replied', 'declined') then
    if new.handled_at is null then
      new.handled_at := now();
    end if;
  elsif new.status in ('pending', 'expired') then
    new.handled_at := null;
  end if;

  if old.handled_at is not null and new.handled_at is distinct from old.handled_at then
    raise exception 'Introduction decision time is immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.get_discover_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;

drop trigger if exists introductions_handled_at on public.conversation_introductions;
create trigger introductions_handled_at
before update on public.conversation_introductions
for each row execute function public.set_introduction_handled_at();

revoke all on function public.set_introduction_handled_at() from public, anon, authenticated;

create or replace function public.expire_introductions()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.conversation_introductions
     set status = 'expired', handled_at = null
   where status = 'pending'
     and expires_at <= now();
$$;

revoke all on function public.expire_introductions() from public, anon, authenticated;

-- Discovery is intentionally photo-free, but eligibility and ordering belong
-- here rather than in the page. The viewer argument is retained for API
-- compatibility; authorization always derives from auth.uid().
create or replace function public.get_discover_profiles(viewer uuid default auth.uid())
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  avatar_path text,
  last_active_at timestamptz,
  quote text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.birth_date,
         p.gender,
         p.country,
         case when p.show_city then p.city end,
         null::text,
         case when p.show_activity_status then p.last_active_at end,
         p.quote
    from public.profiles p
   where p.id <> auth.uid()
     and p.deactivated_at is null
     and p.last_active_at >= now() - interval '7 days'
     and nullif(btrim(p.display_name), '') is not null
     and p.birth_date is not null
     and nullif(btrim(p.gender), '') is not null
     and nullif(btrim(p.country), '') is not null
     and nullif(btrim(p.city), '') is not null
     and nullif(btrim(p.bio), '') is not null
     and nullif(btrim(p.quote), '') is not null
     and nullif(btrim(p.looking_for), '') is not null
     and nullif(btrim(p.avatar_path), '') is not null
     and exists (
       select 1 from public.profile_languages pl where pl.profile_id = p.id
     )
     and (
       select count(*) from public.profile_interests pi where pi.profile_id = p.id
     ) >= 3
     and public.viewer_can_access_profile(p.id)
   order by p.last_active_at desc nulls last, p.created_at desc;
$$;

-- Identity is not the same thing as discovery eligibility. This resolver is
-- deliberately narrow and returns only data needed for authenticated identity
-- links and conversation headers. It never returns exact activity timestamps.
create or replace function public.resolve_profile_identity(target_user uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  avatar_path text,
  activity_status text,
  availability text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.birth_date,
         case when public.can_view_profile_photo(p.id, auth.uid()) then p.avatar_path end,
         case
           when not p.show_activity_status then null
           when p.availability = 'away' then 'Away'
           when p.last_active_at is null then 'Active more than a week ago'
           when p.last_active_at >= now() - interval '5 minutes' then 'Online now'
           when p.last_active_at >= now() - interval '1 hour' then 'Active recently'
           when p.last_active_at >= now() - interval '1 day' then 'Active today'
           when p.last_active_at >= now() - interval '7 days' then 'Active this week'
           else 'Active more than a week ago'
         end,
         case when p.show_activity_status then p.availability else null end
    from public.profiles p
   where p.id = target_user
     and public.viewer_can_access_profile(p.id);
$$;

-- Only rows with a real handled_at are counted as handled. Legacy replied or
-- declined rows without a decision timestamp are excluded instead of creating
-- a fabricated zero-duration response.
create or replace function public.get_response_stats(target_user uuid)
returns table (completed_opportunities bigint, response_rate numeric, median_hours numeric)
language sql
security definer
set search_path = pg_catalog, public
as $$
with target as (
  select 1
    from public.profiles p
   where p.id = target_user
     and p.show_response_rate
     and public.viewer_can_access_profile(p.id)
), valid as (
  select i.*
    from public.conversation_introductions i
   where i.recipient_id = target_user
     and exists (select 1 from target)
     and (
       i.status = 'expired'
       or (i.status in ('replied', 'declined') and i.handled_at is not null)
     )
     and not exists (
       select 1
         from public.profile_blocks b
        where (b.blocker_id = i.sender_id and b.blocked_id = i.recipient_id)
           or (b.blocker_id = i.recipient_id and b.blocked_id = i.sender_id)
     )
     and not exists (
       select 1
         from public.reports r
        where r.target_type = 'introduction'
          and r.target_id = i.id
          and r.status <> 'dismissed'
          and r.reason in (
            'spam', 'scam/fraud', 'harassment', 'sexual/inappropriate content',
            'hate/abuse', 'fake profile/impersonation', 'underage concern'
          )
     )
), stats as (
  select count(*) as completed,
         count(*) filter (where status in ('replied', 'declined')) as handled,
         percentile_cont(0.5) within group (
           order by extract(epoch from (handled_at - created_at)) / 3600.0
         ) filter (where status in ('replied', 'declined')) as median
    from valid
)
select completed,
       case when completed >= 5 then round(handled::numeric * 100 / completed, 0) else null end,
       case when handled > 0 then round(median::numeric, 1) else null end
  from stats
 where exists (select 1 from target);
$$;

revoke all on function public.get_response_stats(uuid) from public, anon, authenticated;
grant execute on function public.get_response_stats(uuid) to authenticated;

revoke all on function public.resolve_profile_identity(uuid) from public, anon, authenticated;
grant execute on function public.resolve_profile_identity(uuid) to authenticated;

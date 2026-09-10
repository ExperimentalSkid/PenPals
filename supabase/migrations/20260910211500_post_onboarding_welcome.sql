-- One-time post-onboarding welcome gate. Existing accounts are backfilled so only new members see it.

alter table public.profiles
  add column if not exists onboarding_welcome_completed_at timestamptz;

update public.profiles p
   set onboarding_welcome_completed_at = coalesce(p.onboarding_welcome_completed_at, now())
 where nullif(trim(p.username), '') is not null
   and nullif(trim(p.display_name), '') is not null
   and p.birth_date is not null
   and nullif(trim(p.country), '') is not null
   and exists (select 1 from public.profile_languages l where l.profile_id = p.id)
   and exists (select 1 from public.profile_interests i where i.profile_id = p.id);

create or replace function public.complete_my_onboarding_welcome()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  language_count integer;
  interest_count integer;
begin
  if me is null then raise exception 'Authentication required'; end if;

  select * into p from public.profiles where id = me for update;
  if p.id is null then raise exception 'Profile setup is not complete'; end if;

  select count(*)::integer into language_count from public.profile_languages where profile_id = me;
  select count(*)::integer into interest_count from public.profile_interests where profile_id = me;

  if nullif(trim(p.username), '') is null
     or nullif(trim(p.display_name), '') is null
     or p.birth_date is null
     or nullif(trim(p.country), '') is null
     or language_count < 1
     or interest_count < 1 then
    raise exception 'Profile setup is not complete';
  end if;

  update public.profiles
     set onboarding_welcome_completed_at = coalesce(onboarding_welcome_completed_at, now())
   where id = me;
end;
$$;

revoke all on function public.complete_my_onboarding_welcome() from public, anon, authenticated;
grant execute on function public.complete_my_onboarding_welcome() to authenticated;

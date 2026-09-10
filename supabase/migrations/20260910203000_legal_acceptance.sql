-- Versioned legal acceptance for new account creation.
create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('email_signup','google_signup')),
  locale text not null check (locale in ('en','es')),
  unique (user_id, terms_version, privacy_version)
);

alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from public, anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

drop policy if exists legal_acceptances_read_own on public.legal_acceptances;
create policy legal_acceptances_read_own on public.legal_acceptances
  for select to authenticated using (user_id = auth.uid());

create or replace function public.capture_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  accepted_locale text;
begin
  accepted_locale := case when metadata->>'locale' = 'es' then 'es' else 'en' end;
  if metadata->>'legal_acceptance' = 'accepted'
     and metadata->>'terms_version' = '2026-09-10'
     and metadata->>'privacy_version' = '2026-09-10' then
    insert into public.legal_acceptances(user_id, terms_version, privacy_version, source, locale)
    values (new.id, '2026-09-10', '2026-09-10', 'email_signup', accepted_locale)
    on conflict (user_id, terms_version, privacy_version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_signup_legal_acceptance on auth.users;
create trigger capture_signup_legal_acceptance
  after insert on auth.users
  for each row execute function public.capture_signup_legal_acceptance();

revoke all on function public.capture_signup_legal_acceptance() from public, anon, authenticated;

create or replace function public.record_my_google_signup_legal_acceptance(
  p_terms_version text,
  p_privacy_version text,
  p_locale text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  me uuid := auth.uid();
  accepted_locale text := case when p_locale = 'es' then 'es' else 'en' end;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if p_terms_version <> '2026-09-10' or p_privacy_version <> '2026-09-10' then
    raise exception 'Unsupported legal document version';
  end if;
  insert into public.legal_acceptances(user_id, terms_version, privacy_version, source, locale)
  values (me, p_terms_version, p_privacy_version, 'google_signup', accepted_locale)
  on conflict (user_id, terms_version, privacy_version) do nothing;
end;
$$;

revoke all on function public.record_my_google_signup_legal_acceptance(text,text,text) from public, anon, authenticated;
grant execute on function public.record_my_google_signup_legal_acceptance(text,text,text) to authenticated;

-- Preserve the existing country/code consistency contract while allowing the
-- normalization trigger to canonicalize equivalent aliases.  A direct write
-- must provide both values together when changing a normalized country.
create or replace function public.guard_profile_country_name_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resolved_code text;
  requested_code text := nullif(upper(btrim(coalesce(new.country_code, ''))), '');
begin
  if tg_op = 'UPDATE'
     and (old.country_code is not null or new.country_code is not null)
     and (new.country is distinct from old.country
          or new.country_code is distinct from old.country_code) then
    -- Resolve by name only.  Passing the requested code here would mask a
    -- mismatched legacy name because the resolver intentionally prefers code.
    select r.code into resolved_code
      from public.resolve_country_code(null, new.country) r;

    if resolved_code is null or requested_code is null
       or resolved_code is distinct from requested_code then
      raise exception 'Country name does not match country code';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_country_name_consistency() from public, anon, authenticated;

drop trigger if exists profiles_country_name_consistency_guard on public.profiles;
create trigger profiles_country_name_consistency_guard
before update of country, country_code
on public.profiles
for each row execute function public.guard_profile_country_name_consistency();

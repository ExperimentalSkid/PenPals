-- Keep database and application slug generation byte-for-byte consistent.
-- The application normalizes Unicode (NFKD) before removing combining marks;
-- PostgreSQL must do the same for catalogue aliases and sitemap slugs.
create or replace function public.seo_public_slug(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = pg_catalog, public
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      regexp_replace(
        regexp_replace(
          pg_catalog."normalize"(lower(btrim(value)), 'NFKD'),
          '[̀-ͯ]', '', 'g'
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+|-+$)', '', 'g'
    )),
    ''
  );
$$;

-- Prevent a domain rule from matching inside an unrelated hostname (for
-- example, evilonlyfans.com).  Host/path forms still match safely.
create or replace function public.moderation_rule_matches(rule_term text, rule_match_type text, content text)
returns boolean language sql immutable strict set search_path = pg_catalog, public as $$
  with normalized as (
    select public.moderation_normalized_text(rule_term) as term,
           public.moderation_normalized_text(content) as body
  )
  select case
    when rule_match_type = 'domain' then
      body ~ ('(^|[^[:alnum:]])' || replace(term, '.', chr(92) || '.') || '([^[:alnum:]]|$)')
    when rule_match_type = 'contains' then
      position(lower(btrim(rule_term)) in lower(content)) > 0
      or position(term in body) > 0
    else position(' ' || term || ' ' in ' ' || body || ' ') > 0
  end from normalized
$$;
revoke all on function public.moderation_rule_matches(text, text, text) from public, anon, authenticated;


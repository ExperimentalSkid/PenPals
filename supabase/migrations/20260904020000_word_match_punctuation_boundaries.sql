-- Treat punctuation as a word boundary for phrase rules.  This keeps
-- "OnlyFans." and "paid content," equivalent to their plain-text forms
-- without introducing fuzzy or substring matching.
create or replace function public.moderation_rule_matches(rule_term text, rule_match_type text, content text)
returns boolean language sql immutable strict set search_path = pg_catalog, public as $$
  with normalized as (
    select public.moderation_normalized_text(rule_term) as term,
           public.moderation_normalized_text(content) as body
  ), words as (
    select btrim(regexp_replace(term, '[^[:alnum:]]+', ' ', 'g')) as term,
           btrim(regexp_replace(body, '[^[:alnum:]]+', ' ', 'g')) as body
    from normalized
  )
  select case
    when rule_match_type = 'domain' then
      normalized.body ~ ('(^|[^[:alnum:]])' || replace(normalized.term, '.', chr(92) || '.') || '([^[:alnum:]]|$)')
    when rule_match_type = 'contains' then
      position(lower(btrim(rule_term)) in lower(content)) > 0
      or position(normalized.term in normalized.body) > 0
    else position(' ' || words.term || ' ' in ' ' || words.body || ' ') > 0
  end
  from normalized join words on true
$$;
revoke all on function public.moderation_rule_matches(text, text, text) from public, anon, authenticated;

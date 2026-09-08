-- Additional explicit handle spellings from the rule pack.  These are
-- separate rules so administrators can disable one form without affecting
-- domain or phrase detection.
insert into public.moderation_detection_rules
  (rule_identifier, term, category, match_type, signal_strength, requires_context, context_group, is_system_default)
values
  ('handle.onlyfans-colon', 'onlyfans:', 'paid_adult_content', 'contains', 'MEDIUM', false, null, true),
  ('handle.fansly-colon', 'fansly:', 'paid_adult_content', 'contains', 'MEDIUM', false, null, true),
  ('solicitation.price-menu', 'price menu', 'commercial_solicitation', 'word', 'HIGH', false, null, true)
on conflict (rule_identifier) do nothing;


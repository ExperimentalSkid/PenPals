-- Additional active adult creator platforms confirmed during the current
-- provider/domain review.  These are high-confidence domain signals only;
-- they still create triage evidence and never enforce account actions.
insert into public.moderation_detection_rules
  (rule_identifier, term, category, match_type, signal_strength, requires_context, context_group, is_system_default)
values
  ('adult.luxeafterdark.com', 'luxeafterdark.com', 'paid_adult_content', 'domain', 'HIGH', false, null, true),
  ('adult.korz.one', 'korz.one', 'paid_adult_content', 'domain', 'HIGH', false, null, true)
on conflict (rule_identifier) do nothing;


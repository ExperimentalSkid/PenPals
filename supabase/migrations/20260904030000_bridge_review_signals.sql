-- A bridge/link-hub URL is itself a review-only signal.  It is not an adult
-- classification, but it must be visible to staff so contextual destinations
-- can be reviewed without crawling or following the URL.  Preserve any
-- administrator customization by changing only system defaults.
update public.moderation_detection_rules
   set requires_context = false,
       updated_at = now()
 where category = 'bridge_link'
   and is_system_default = true;


-- Preserve accepted snapshots and historic links while withdrawing inflated
-- photo/observation/craft variants from all new catalog recommendations.
update public.quest_templates set published=false
where family_id like 'activity\_%' escape '\' and intensity='full_send' and version in (1,2);

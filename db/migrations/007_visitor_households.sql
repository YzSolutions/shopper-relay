-- Each browser gets its own copy of the demo, so visitors (and judges) testing at the
-- same time never see or reset each other's households. Older rows have no visitor and
-- are simply no longer shown.
alter table households add column visitor_id text;
create unique index households_visitor_relationship on households (visitor_id, relationship);

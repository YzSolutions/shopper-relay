-- Demo setting: replace real store and brand names with invented ones (the demo video can't show third-party trademarks).
alter table households add column hide_brands boolean not null default false;

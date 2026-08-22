-- Associations added after 0001_seed already ran remotely.
-- Wrangler tracks migrations by filename, so editing 0001 never re-applies.
-- Fresh databases already get the original six rows from 0001_seed.sql.
-- No grade_weights: these finishes stay out of the AMND/PL championship
-- until someone calibrates weights on purpose.
-- Hills is name-only: do not store e801d340 or NSW cd26c84e.
-- Do not store WA SADNA 489c7576, Netball SA Country carnival b0bbe786,
-- or Adelaide Plains / BLGNA *-rep orgs.
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('city_night_division', 'City Night Division', '2276ec85') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('saucna', 'South Australian United Church Netball Association', 'fb89f1f1') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('suna', 'Southern United Netball Association', '4bd9b8ae') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('elizabeth', 'Elizabeth Netball Association', '7ffb0e67') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('sammna', 'South Australian Men''s and Mixed Netball Association', '7936878d') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('sadna', 'SA Districts Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('hills', 'Hills Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('mid_hills', 'Mid Hills Netball Association', '7d13cb92') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('shna', 'Southern Hills Netball Association', 'de681683') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('gsna', 'Great Southern Netball Association', '879ed891') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('masters', 'Netball SA Masters', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('barossa', 'Barossa, Light and Gawler Netball Association', 'd8505173') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('gawler', 'Gawler and District Netball Association', '10c20df0') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('kangaroo_island', 'Kangaroo Island Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('kadina', 'Kadina and Districts Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('yorke_peninsula', 'Yorke Peninsula Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('river_murray', 'River Murray Netball Association', '33effa50') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('port_augusta', 'Port Augusta Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('port_pirie', 'Port Pirie Netball Association', '75d217b0') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('roxby_downs', 'Roxby Downs Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('whyalla', 'Whyalla Netball Association', '57c29823') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('adelaide_plains', 'Adelaide Plains Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('northern_areas', 'Northern Areas Netball Association', '8dd4ad01') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('north_eastern', 'North Eastern Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('murray_valley', 'Murray Valley Football Netball League', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('riverland', 'Riverland Netball Association', '1310360a') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('knt', 'Kowree-Naracoorte-Tatiara Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('mid_south_east', 'Mid South East Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('mount_gambier', 'Mount Gambier Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('limestone_coast', 'Limestone Coast Football Netball League', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('eastern_eyre', 'Eastern Eyre Netball Association', '57f440eb') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('great_flinders', 'Great Flinders Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('port_lincoln', 'Port Lincoln Netball Association', '3c28509a') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('western_eyre', 'Western Eyre Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;

-- Metro associations added after 0001_seed already ran remotely.
-- Wrangler tracks migrations by filename, so editing 0001 never re-applies.
-- Fresh databases already get the original six rows from 0001_seed.sql.
-- No grade_weights: these finishes stay out of the AMND/PL championship
-- until someone calibrates weights on purpose.
-- Hills is name-only: do not store e801d340 or NSW cd26c84e.
-- Mid Hills and SHNA orgs are live PlayHQ IDs from discoverCompetitions.
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('city_night_division', 'City Night Division', '2276ec85') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('saucna', 'South Australian United Church Netball Association', 'fb89f1f1') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('suna', 'Southern United Netball Association', '4bd9b8ae') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('elizabeth', 'Elizabeth Netball Association', '7ffb0e67') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('sammna', 'South Australian Men''s and Mixed Netball Association', '7936878d') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('sadna', 'SA Districts Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('hills', 'Hills Netball Association', NULL) ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('mid_hills', 'Mid Hills Netball Association', '7d13cb92') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('shna', 'Southern Hills Netball Association', 'de681683') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;

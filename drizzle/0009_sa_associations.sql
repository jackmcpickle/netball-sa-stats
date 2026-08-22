-- SA associations added after 0001_seed already ran remotely.
-- Wrangler tracks migrations by filename, so editing 0001 never re-applies.
-- Fresh databases already get these rows from 0001_seed.sql.
-- No grade_weights: these finishes stay out of the AMND/PL championship
-- until someone calibrates weights on purpose.
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('saucna', 'South Australian United Church Netball Association', 'fb89f1f1') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('suna', 'Southern United Netball Association', '4bd9b8ae') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('hills', 'Hills Netball Association', 'e801d340') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('mid_hills', 'Mid Hills Netball Association', '7d13cb92') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;
INSERT INTO competitions (key, name, playhq_org_id) VALUES ('southern_hills', 'Southern Hills Netball Association', 'de681683') ON CONFLICT(key) DO UPDATE SET name = excluded.name, playhq_org_id = excluded.playhq_org_id;

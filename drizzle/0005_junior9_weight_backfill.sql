-- Backfill for databases seeded before Junior 9 and Sub-Junior 9 were added to
-- src/pipeline/seed/catalogue.ts. The archive import (2000-2016) includes both
-- grades, and a grade with no weight row scores nothing, so the gap was a
-- silent zero on every club's finish in Junior 9 / Sub-Junior 9.
-- Idempotent: fresh databases already get these rows from 0001_seed.sql.
INSERT INTO grade_weights (competition_id, tier, division, label, weight)
SELECT id, 8, 9, 'Junior 9', 0.26 FROM competitions WHERE key = 'amnd'
ON CONFLICT (competition_id, tier, division) DO NOTHING;

INSERT INTO grade_weights (competition_id, tier, division, label, weight)
SELECT id, 9, 9, 'Sub-Junior 9', 0.2 FROM competitions WHERE key = 'amnd'
ON CONFLICT (competition_id, tier, division) DO NOTHING;

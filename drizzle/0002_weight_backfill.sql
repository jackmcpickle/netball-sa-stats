-- Backfill for databases seeded before Inter. 6 and Primary 7 were added to
-- src/pipeline/seed/catalogue.ts. The imported grades include both, and a grade
-- with no weight row scores nothing, so the gap was a silent zero.
-- Idempotent: fresh databases already get these rows from 0001_seed.sql.
INSERT INTO grade_weights (competition_id, tier, division, label, weight)
SELECT id, 6, 6, 'Inter. 6', 0.35 FROM competitions WHERE key = 'amnd'
ON CONFLICT (competition_id, tier, division) DO NOTHING;

INSERT INTO grade_weights (competition_id, tier, division, label, weight)
SELECT id, 10, 7, 'Primary 7', 0.17 FROM competitions WHERE key = 'amnd'
ON CONFLICT (competition_id, tier, division) DO NOTHING;

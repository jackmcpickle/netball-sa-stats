-- Ruling A: Inter. band step 0.02 -> 0.015 (src/pipeline/seed/catalogue.ts).
-- At 0.02, Inter. 6 (0.35) sat below C 1 (0.36), violating the documented
-- "C sits below Inter" rule. Fresh databases already get the corrected
-- values from 0001_seed.sql; this UPDATEs an already-migrated database's
-- existing rows to match. Idempotent: re-running sets the same values.
UPDATE grade_weights SET weight = 0.45
WHERE tier = 6 AND division = 1
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

UPDATE grade_weights SET weight = 0.435
WHERE tier = 6 AND division = 2
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

UPDATE grade_weights SET weight = 0.42
WHERE tier = 6 AND division = 3
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

UPDATE grade_weights SET weight = 0.405
WHERE tier = 6 AND division = 4
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

UPDATE grade_weights SET weight = 0.39
WHERE tier = 6 AND division = 5
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

UPDATE grade_weights SET weight = 0.375
WHERE tier = 6 AND division = 6
  AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');

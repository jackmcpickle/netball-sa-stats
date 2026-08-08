-- Team identity fix: PlayHQ's team.id (teams.playhq_id) is the stable natural
-- key for a team, not an index-in-sorted-collision-group synthetic
-- squad_number. The old (grade_id, club_id, squad_number) index let colour-
-- named teams (no numeric suffix) collide and get a fabricated squad_number
-- that shifted whenever a teammate was added/removed between scrapes,
-- silently orphaning/duplicating rows. squad_number stays a display-only
-- field, real only for genuine numeric suffixes.
DROP INDEX IF EXISTS teams_grade_club_squad_idx;

CREATE UNIQUE INDEX IF NOT EXISTS teams_grade_playhq_idx ON teams (grade_id, playhq_id);

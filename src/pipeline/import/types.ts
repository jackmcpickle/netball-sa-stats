/** Shared types for stage 2 of the pipeline: CSV -> D1. */

export type RawRow = Record<string, string>;

export type SeasonImportRow = {
    competitionKey: string;
    seasonKey: string;
    competitionPeriod: string;
    label: string;
    startYear: number;
    endYear: number;
    isFinal: boolean;
    playhqId: string | null;
    source: string;
};

export type ClubImportRow = {
    clubKey: string;
    name: string;
    establishedYear: number | null;
    homeVenue: string | null;
    playhqId: string | null;
};

export type ClubAliasImportRow = {
    clubKey: string;
    aliasText: string;
    source: string;
};

export type GradeImportRow = {
    seasonKey: string;
    gradeKey: string;
    name: string;
    tier: number;
    division: number | null;
    teamCount: number;
    ageBand: string | null;
    playhqId: string | null;
};

export type TeamImportRow = {
    clubKey: string;
    gradeKey: string;
    displayName: string;
    squadNumber: number | null;
    playhqId: string | null;
};

export type TeamSeasonResultImportRow = {
    gradeKey: string;
    clubKey: string;
    squadNumber: number | null;
    displayName: string;
    ladderPosition: number;
    positionUncertain: boolean;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    byes: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    goalDifference: number | null;
    points: number | null;
    percentage: number | null;
    shotsAttempted: number | null;
    shotsScored: number | null;
    source: string;
    placementBasis: string;
    notes: string | null;
    scrapedAt: number | null;
};

export type ImportData = {
    seasons: SeasonImportRow[];
    clubs: ClubImportRow[];
    clubAliases: ClubAliasImportRow[];
    grades: GradeImportRow[];
    teams: TeamImportRow[];
    results: TeamSeasonResultImportRow[];
};

/** Row failed validation: named so the operator can find it in the CSV. */
export class ImportValidationError extends Error {
    public readonly file: string;
    public readonly line: number | null;
    public readonly value: unknown;

    public constructor(
        file: string,
        line: number | null,
        message: string,
        value?: unknown,
    ) {
        super(
            line === null
                ? `${file}: ${message}`
                : `${file}:${line}: ${message}`,
        );
        this.name = 'ImportValidationError';
        this.file = file;
        this.line = line;
        this.value = value;
    }
}

export type TeamCountWarning = {
    gradeKey: string;
    previousGradeKey: string;
    teamCount: number;
    previousTeamCount: number;
};

/**
 * Upstream (PlayHQ) ladder data where `played !== won + drawn + lost`. Not a
 * scraper bug — PlayHQ's own source data is internally inconsistent for a
 * small fraction of rows. The row still imports with its values completely
 * unchanged; this is recorded for visibility (and mirrored into the row's
 * `notes` column) rather than silently dropped or invented.
 */
export type PlayedMismatchWarning = {
    gradeKey: string;
    clubKey: string;
    displayName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
};

/** Talks to whatever D1 the caller wired up (local wrangler, remote wrangler, in-memory sqlite for tests). */
export type ImportExecutor = {
    queryAll: (sql: string) => Promise<Record<string, unknown>[]>;
    batch: (statements: readonly string[]) => Promise<void>;
};

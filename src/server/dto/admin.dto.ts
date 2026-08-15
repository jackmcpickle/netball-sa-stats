import type { ImportRunStatus } from '@/db/schema';

export interface AdminRunDto {
    id: number;
    startedLabel: string;
    status: ImportRunStatus;
    seasons: number | null;
    grades: number | null;
    gamesCount: number | null;
    warningCount: number;
    durationLabel: string;
    errorText: string | null;
    warnings: readonly string[];
}

export interface AdminPageDto {
    running: boolean;
    runningElapsedLabel: string | null;
    lastStatus: ImportRunStatus | null;
    runs: readonly AdminRunDto[];
}

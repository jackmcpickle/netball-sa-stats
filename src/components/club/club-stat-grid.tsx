import type { JSX } from 'react';
import { formatNumber, formatPercent, NO_VALUE } from '@/components/format';
import { StatFigure } from '@/components/ui/layout';
import type { ClubProfile } from '@/server/dto/club-profile.dto';

/** The four career figures beside the club hero. */
export function ClubStatGrid({
    profile,
}: {
    readonly profile: ClubProfile;
}): JSX.Element {
    return (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-card bg-paper-sunken p-4 sm:p-6">
                <StatFigure
                    value={formatNumber(profile.careerPoints, 0)}
                    caption="championship points, all seasons"
                />
            </div>
            <div className="rounded-card bg-paper-sunken p-4 sm:p-6">
                <StatFigure
                    value={profile.minorPremierships}
                    caption="grade ladders topped"
                />
            </div>
            <div className="rounded-card bg-paper-sunken p-4 sm:p-6">
                <StatFigure
                    value={formatPercent(profile.winPercentage)}
                    caption="win rate across all grades"
                />
            </div>
            <div className="rounded-card bg-paper-sunken p-4 sm:p-6">
                <StatFigure
                    value={
                        profile.gamesPlayed > 0 ? profile.gamesPlayed : NO_VALUE
                    }
                    caption="games played"
                />
            </div>
        </div>
    );
}

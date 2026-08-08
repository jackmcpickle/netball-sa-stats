import { describe, expect, it } from 'vitest';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';

describe('timelineSlots', () => {
    it('inserts gap markers between non-adjacent ranked years', () => {
        expect(timelineSlots([2014, 2016, 2022])).toEqual([
            { kind: 'year', year: 2014 },
            { kind: 'gap', afterYear: 2014, missingYears: [2015] },
            { kind: 'year', year: 2016 },
            {
                kind: 'gap',
                afterYear: 2016,
                missingYears: [2017, 2018, 2019, 2020, 2021],
            },
            { kind: 'year', year: 2022 },
        ]);
    });
});

describe('gapLabel', () => {
    it('formats single and ranged missing years', () => {
        expect(gapLabel([2015])).toBe('2015');
        expect(gapLabel([2017, 2018, 2019, 2020, 2021])).toBe('2017–2021');
    });
});

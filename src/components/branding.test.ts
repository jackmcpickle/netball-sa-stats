import { describe, expect, it } from 'vitest';
import { NETBALL_ICON_ATTRIBUTION } from '@/components/branding';

describe('netball icon credit', () => {
    it('points at Noun Project with CC BY credit', () => {
        expect(NETBALL_ICON_ATTRIBUTION.creator).toBe('Made by Made');
        expect(NETBALL_ICON_ATTRIBUTION.href).toBe(
            'https://thenounproject.com/creator/elki/',
        );
        expect(NETBALL_ICON_ATTRIBUTION.license).toBe('CC BY 3.0');
        expect(NETBALL_ICON_ATTRIBUTION.title).toBe('netball Icons');
    });
});

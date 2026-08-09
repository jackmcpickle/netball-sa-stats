import { expect, test } from 'vitest';
import { NETBALL_ICON_ATTRIBUTION } from '@/components/branding';

test('netball icon attribution points at Noun Project with CC BY credit', () => {
    expect(NETBALL_ICON_ATTRIBUTION.creator).toBe('Made by Made');
    expect(NETBALL_ICON_ATTRIBUTION.href).toBe(
        'https://thenounproject.com/browse/icons/term/netball/',
    );
    expect(NETBALL_ICON_ATTRIBUTION.license).toBe('CC BY 3.0');
    expect(NETBALL_ICON_ATTRIBUTION.title).toBe('netball Icons');
});

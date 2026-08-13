import { describe, expect, it } from 'vitest';
import {
    ADMIN_COOKIE,
    clearSessionCookieHeader,
    passwordsMatch,
    SESSION_TTL_SECONDS,
    sessionCookieHeader,
    signSession,
    verifySession,
} from '@/server/admin-auth';

const SECRET = 'test-session-secret-at-least-32-bytes-long';

describe('passwordsMatch', () => {
    it('returns true when passwords are equal', async () => {
        expect(await passwordsMatch('correct', 'correct', SECRET)).toBe(true);
    });

    it('returns false when passwords differ', async () => {
        expect(await passwordsMatch('wrong', 'correct', SECRET)).toBe(false);
    });

    it('returns false when submitted is empty', async () => {
        expect(await passwordsMatch('', 'correct', SECRET)).toBe(false);
    });

    it('returns false when stored is empty', async () => {
        expect(await passwordsMatch('correct', '', SECRET)).toBe(false);
    });

    it('returns false when passwords differ in length', async () => {
        expect(
            await passwordsMatch('short', 'much-longer-password', SECRET),
        ).toBe(false);
    });
});

describe('session cookie', () => {
    const expiresAt = 1_700_000_000;

    it('signs and verifies before expiry', async () => {
        const value = await signSession(expiresAt, SECRET);
        expect(await verifySession(value, SECRET, expiresAt - 1)).toBe(true);
    });

    it('rejects at or after expiry', async () => {
        const value = await signSession(expiresAt, SECRET);
        expect(await verifySession(value, SECRET, expiresAt)).toBe(false);
    });

    it('rejects tampered hmac', async () => {
        const value = await signSession(expiresAt, SECRET);
        const tampered = value.replace(/[a-f]$/u, '0');
        expect(await verifySession(tampered, SECRET, expiresAt - 1)).toBe(
            false,
        );
    });

    it('rejects missing cookie', async () => {
        expect(await verifySession(undefined, SECRET, expiresAt - 1)).toBe(
            false,
        );
    });

    it('rejects malformed cookie values', async () => {
        expect(await verifySession('exp.nope.ab', SECRET, expiresAt - 1)).toBe(
            false,
        );
    });
});

describe('cookie headers', () => {
    it('sets the admin cookie with Path=/ and seven-day max age', () => {
        expect(sessionCookieHeader('signed-value')).toBe(
            `${ADMIN_COOKIE}=signed-value; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
        );
    });

    it('clears the admin cookie', () => {
        expect(clearSessionCookieHeader()).toBe(
            `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        );
    });
});

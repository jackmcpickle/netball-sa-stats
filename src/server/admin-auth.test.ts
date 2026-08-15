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

describe(passwordsMatch, () => {
    it('returns true when passwords are equal', async () => {
        await expect(
            passwordsMatch('correct', 'correct', SECRET),
        ).resolves.toBeTruthy();
    });

    it('returns false when passwords differ', async () => {
        await expect(
            passwordsMatch('wrong', 'correct', SECRET),
        ).resolves.toBeFalsy();
    });

    it('returns false when submitted is empty', async () => {
        await expect(
            passwordsMatch('', 'correct', SECRET),
        ).resolves.toBeFalsy();
    });

    it('returns false when stored is empty', async () => {
        await expect(
            passwordsMatch('correct', '', SECRET),
        ).resolves.toBeFalsy();
    });

    it('returns false when passwords differ in length', async () => {
        await expect(
            passwordsMatch('short', 'much-longer-password', SECRET),
        ).resolves.toBeFalsy();
    });
});

describe('session cookie', () => {
    const expiresAt = 1_700_000_000;

    it('signs and verifies before expiry', async () => {
        const value = await signSession(expiresAt, SECRET);
        await expect(
            verifySession(value, SECRET, expiresAt - 1),
        ).resolves.toBeTruthy();
    });

    it('rejects at or after expiry', async () => {
        const value = await signSession(expiresAt, SECRET);
        await expect(
            verifySession(value, SECRET, expiresAt),
        ).resolves.toBeFalsy();
    });

    it('rejects tampered hmac', async () => {
        const value = await signSession(expiresAt, SECRET);
        const tampered = value.replace(/[a-f]$/u, '0');
        await expect(
            verifySession(tampered, SECRET, expiresAt - 1),
        ).resolves.toBeFalsy();
    });

    it('rejects missing cookie', async () => {
        await expect(
            verifySession(undefined, SECRET, expiresAt - 1),
        ).resolves.toBeFalsy();
    });

    it('rejects malformed cookie values', async () => {
        await expect(
            verifySession('exp.nope.ab', SECRET, expiresAt - 1),
        ).resolves.toBeFalsy();
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

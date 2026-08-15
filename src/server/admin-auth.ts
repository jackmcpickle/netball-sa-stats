export const ADMIN_COOKIE = 'nod_admin';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';

async function hmacBytes(secret: string, message: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    return new Uint8Array(
        await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(message),
        ),
    );
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
        return false;
    }
    // SAFETY: the widening only adds an optional member, and the guard on the
    // next line checks `subtle.timingSafeEqual` before it is ever invoked.
    const subtle = crypto.subtle as SubtleCrypto & {
        timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
    };
    if (subtle.timingSafeEqual) {
        return subtle.timingSafeEqual(left, right);
    }
    let diff = 0;
    for (let i = 0; i < left.byteLength; i += 1) {
        diff += Math.abs(left[i] - right[i]);
    }
    return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
    );
}

function hexToBytes(hex: string): Uint8Array | null {
    if (hex.length % 2 !== 0) {
        return null;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) {
            return null;
        }
        bytes[i] = byte;
    }
    return bytes;
}

export async function passwordsMatch(
    submitted: string,
    stored: string,
    sessionSecret: string,
): Promise<boolean> {
    if (submitted.length === 0 || stored.length === 0) {
        return false;
    }
    const submittedDigest = await hmacBytes(sessionSecret, submitted);
    // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- sequential, unconditional HMACs keep the comparison's timing independent of the input
    const storedDigest = await hmacBytes(sessionSecret, stored);
    return timingSafeEqual(submittedDigest, storedDigest);
}

export async function signSession(
    expiresAtEpochSeconds: number,
    sessionSecret: string,
): Promise<string> {
    const message = `exp.${expiresAtEpochSeconds}`;
    const digest = await hmacBytes(sessionSecret, message);
    return `${message}.${bytesToHex(digest)}`;
}

export async function verifySession(
    cookieValue: string | undefined,
    sessionSecret: string,
    nowEpochSeconds: number,
): Promise<boolean> {
    if (cookieValue === undefined) {
        return false;
    }

    const parts = cookieValue.split('.');
    if (parts.length !== 3) {
        return false;
    }

    const [prefix, expiresText, providedHex] = parts;
    if (prefix !== 'exp') {
        return false;
    }

    const expiresAt = Number(expiresText);
    if (!Number.isInteger(expiresAt)) {
        return false;
    }

    if (nowEpochSeconds >= expiresAt) {
        return false;
    }

    const providedBytes = hexToBytes(providedHex);
    if (providedBytes === null) {
        return false;
    }

    const expectedBytes = await hmacBytes(sessionSecret, `exp.${expiresAt}`);
    return timingSafeEqual(providedBytes, expectedBytes);
}

export function sessionCookieHeader(value: string): string {
    return `${ADMIN_COOKIE}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
    return `${ADMIN_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}

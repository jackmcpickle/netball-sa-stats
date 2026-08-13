import { env } from 'cloudflare:workers';

export function readAdminSecrets(): {
    password: string;
    sessionSecret: string;
} {
    const secrets = env as typeof env & {
        ADMIN_PASSWORD?: string;
        ADMIN_SESSION_SECRET?: string;
    };
    return {
        password: secrets.ADMIN_PASSWORD ?? '',
        sessionSecret: secrets.ADMIN_SESSION_SECRET ?? '',
    };
}

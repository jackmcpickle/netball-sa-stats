import { env } from 'cloudflare:workers';

export interface AdminSecrets {
    readonly password: string;
    readonly sessionSecret: string;
}

export function readAdminSecrets(): AdminSecrets {
    // SAFETY: the widening only adds two optional members, so it cannot claim
    // a value that is absent; both reads below apply `?? ''`.
    const secrets = env as typeof env & {
        ADMIN_PASSWORD?: string;
        ADMIN_SESSION_SECRET?: string;
    };
    return {
        password: secrets.ADMIN_PASSWORD ?? '',
        sessionSecret: secrets.ADMIN_SESSION_SECRET ?? '',
    };
}

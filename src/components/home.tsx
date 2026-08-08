import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';

const routeApi = getRouteApi('/');

export function Home(): JSX.Element {
    const teams = routeApi.useLoaderData();

    return (
        <main>
            <h1>{'Netball Stats'}</h1>
            <ul>
                {teams.map((team) => (
                    <li key={team.id}>{team.name}</li>
                ))}
            </ul>
        </main>
    );
}

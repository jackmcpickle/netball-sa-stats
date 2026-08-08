import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';

const routeApi = getRouteApi('/');

export function Home(): JSX.Element {
    const competitions = routeApi.useLoaderData();

    return (
        <main>
            <h1>{'Netball Open Data'}</h1>
            <ul>
                {competitions.map((competition) => (
                    <li key={competition.id}>{competition.name}</li>
                ))}
            </ul>
        </main>
    );
}

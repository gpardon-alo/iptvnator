import {
    discoveryState,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { COUNTRIES, STATES, type DemoChannel } from './discovery-catalog';

/** The editable name is the group key; provider titles are never normalized. */
export function groupDiscoveryChannels(
    rows: ClassifiedStream[],
    logos: ReadonlyMap<number, string>
): DemoChannel[] {
    const groups = new Map<string, DemoChannel>();
    const seen = new Set<string>();
    const places = new Map(
        COUNTRIES.map((country) => [country.id, country.name])
    );
    for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const name = row.name.trim();
        const key = JSON.stringify([
            row.provider.source_id,
            name ? 'name' : 'stream',
            name || row.id,
        ]);
        const state = discoveryState(row);
        const stateName = STATES.find((s) => s.id === state)?.name;
        const facets = {
            country: row.country,
            state: state || undefined,
            category: row.category || 'unclassified',
            language: row.language || 'Unknown',
            location: stateName
                ? `${stateName}, United States`
                : (places.get(row.country) ?? 'Unknown country'),
            logo:
                logos.get(row.provider.stream_id) || 'assets/icons/icon-64.png',
        };
        const channel: DemoChannel = groups.get(key) ?? {
            id: `group:${key}`,
            name,
            ...facets,
            sources: [],
        };
        channel.sources.push({
            id: row.id,
            label: row.provider.name,
            quality: row.quality ?? 'Unknown',
            facets,
        });
        groups.set(key, channel);
    }
    return [...groups.values()];
}

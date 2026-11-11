import { matchesDiscoveryLeague } from './discovery-leagues';
import {
    DISCOVERY_QUALITIES,
    type DiscoveryQuality,
} from '@iptvnator/portal/shared/util';
/** Synthetic catalog owned by the Discovery prototype; no provider data or streams. */
export const CATEGORIES = [
    ['general', 'General TV', 'live_tv'],
    ['news', 'News', 'public'],
    ['sports', 'Sports', 'sports_soccer'],
    ['movies', 'Movies & Series', 'movie'],
    ['entertainment', 'Entertainment', 'theaters'],
    ['kids', 'Kids', 'child_care'],
    ['documentaries', 'Documentaries', 'explore'],
    ['music', 'Music', 'music_note'],
    ['lifestyle', 'Lifestyle', 'spa'],
    ['education', 'Education', 'school'],
    ['religion', 'Religion', 'auto_awesome'],
] as const;
export const QUALITIES = DISCOVERY_QUALITIES;
export type Quality = DiscoveryQuality;
export {
    COUNTRIES,
    STATES,
    LOCATIONS,
    LANGUAGES,
    type DiscoveryLocation,
} from './discovery-locations';
import { LOCATIONS } from './discovery-locations';
export interface DemoSource {
    id: string;
    label: string;
    quality: Quality;
    facets?: DiscoveryFacets;
}
export interface DiscoveryFacets {
    country: string;
    state?: string;
    location: string;
    category: string;
    language: string;
    logo: string;
}
export interface DemoChannel extends DiscoveryFacets {
    id: string;
    name: string;
    sources: DemoSource[];
}
export interface DiscoveryFilters {
    league?: string;
    locations: string[];
    categories: string[];
    languages: string[];
    qualities: string[];
    query: string;
}
export interface ChannelMatch {
    channel: DemoChannel;
    sources: DemoSource[];
}
const brands = [
    'Solis',
    'Marea',
    'Pulse',
    'Lumen',
    'Velora',
    'Juno',
    'Terra',
    'Tempo',
    'Mosaic',
    'Curio',
    'Halo',
];
// Keep the synthetic demo sample small; real classifications support every state.
const DEMO_LOCATIONS = LOCATIONS.filter(
    (l) =>
        !l.id.startsWith('US-') ||
        ['US-CA', 'US-NY', 'US-TX', 'US-FL', 'US-WA', 'US-IL'].includes(l.id)
);
export const DEMO_CHANNELS: DemoChannel[] = DEMO_LOCATIONS.map(
    (location, place) =>
        CATEGORIES.map(([category, label], genre) => ({
            // Feed identity is explicit. Regional feeds never collapse by name.
            id: `demo-${location.id}-${category}`,
            name: `${brands[genre]} ${label === 'General TV' ? 'TV' : label}`,
            country: location.id.startsWith('US-') ? 'US' : location.id,
            state: location.id.startsWith('US-') ? location.id : undefined,
            location: location.name,
            category,
            language: location.language,
            logo: `assets/discovery/logos/${category}.svg`,
            sources: Array.from(
                { length: 1 + ((place + genre) % 3) },
                (_, index) => ({
                    id: `demo-${location.id}-${category}-${index}`,
                    label: `Demo source ${index + 1}`,
                    quality:
                        QUALITIES[(place + genre + index) % QUALITIES.length],
                })
            ),
        }))
).reduce<DemoChannel[]>((all, rows) => all.concat(rows), []);

const CHANNEL_NAME_ORDER = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
});

export function filterChannels(
    channels: DemoChannel[],
    filters: DiscoveryFilters
): ChannelMatch[] {
    const query = filters.query.trim().toLocaleLowerCase();
    return channels
        .reduce<ChannelMatch[]>((matches, channel) => {
            const sources = channel.sources
                .filter((source) => {
                    const facet = source.facets ?? channel;
                    return (
                        matchesDiscoveryLeague(
                            filters.league,
                            channel.name,
                            source.label
                        ) &&
                        (!filters.locations.length ||
                            filters.locations.includes(facet.country) ||
                            Boolean(
                                facet.state &&
                                filters.locations.includes(facet.state)
                            )) &&
                        (!filters.categories.length ||
                            filters.categories.includes(facet.category)) &&
                        (!filters.languages.length ||
                            filters.languages.includes(facet.language)) &&
                        (!filters.qualities.length ||
                            filters.qualities.includes(source.quality)) &&
                        (!query ||
                            `${channel.name} ${source.label} ${facet.location} ${facet.language}`
                                .toLocaleLowerCase()
                                .includes(query))
                    );
                })
                .sort(
                    (a, b) =>
                        QUALITIES.indexOf(a.quality) -
                        QUALITIES.indexOf(b.quality)
                );
            if (sources.length)
                matches.push({
                    channel: sources[0].facets
                        ? { ...channel, ...sources[0].facets }
                        : channel,
                    sources,
                });
            return matches;
        }, [])
        .sort((a, b) =>
            CHANNEL_NAME_ORDER.compare(a.channel.name, b.channel.name)
        );
}

export function toggleSelection(values: string[], value: string): string[] {
    return values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];
}

/** The uncategorized section is exclusive; known genres still support OR. */
export function toggleDiscoveryCategory(
    values: string[],
    value: string
): string[] {
    if (value === 'unclassified')
        return values.length === 1 && values[0] === value ? [] : [value];
    return toggleSelection(
        values.filter((v) => v !== 'unclassified'),
        value
    );
}

export function discoveryCategoryLabel(category: string): string {
    return (
        CATEGORIES.find(([id]) => id === category)?.[1] ??
        'Unclassified category'
    );
}

export function discoveryChannelLabel(channel: DemoChannel): string {
    return `${channel.location} · ${discoveryCategoryLabel(channel.category)} · ${channel.language === 'Unknown' ? 'Unknown language' : channel.language}`;
}

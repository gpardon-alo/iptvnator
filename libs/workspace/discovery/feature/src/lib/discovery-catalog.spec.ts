import {
    DEMO_CHANNELS,
    filterChannels,
    toggleDiscoveryCategory,
    discoveryChannelLabel,
    type DiscoveryFilters,
} from './discovery-catalog';

const empty: DiscoveryFilters = {
    locations: [],
    categories: [],
    languages: [],
    qualities: [],
    query: '',
};

describe('Discovery prototype filtering', () => {
    it('sorts matching cards by name naturally without changing source ranking or input order', () => {
        const base = DEMO_CHANNELS[0];
        const sources = [
            { id: 'synthetic-hd', label: 'HD source', quality: 'HD' as const },
            { id: 'synthetic-4k', label: '4K source', quality: '4K' as const },
        ];
        const channels = ['Zeta', 'Channel 10', 'alpha', 'Channel 2'].map(
            (name) => ({
                ...base,
                id: name,
                name,
                sources,
            })
        );
        const matches = filterChannels(channels, empty);
        expect(matches.map((match) => match.channel.name)).toEqual([
            'alpha',
            'Channel 2',
            'Channel 10',
            'Zeta',
        ]);
        expect(matches[0].sources.map((source) => source.quality)).toEqual([
            '4K',
            'HD',
        ]);
        expect(channels.map((channel) => channel.name)).toEqual([
            'Zeta',
            'Channel 10',
            'alpha',
            'Channel 2',
        ]);
        expect(sources.map((source) => source.quality)).toEqual(['HD', '4K']);
        expect(
            filterChannels(channels, { ...empty, query: 'channel' }).map(
                (match) => match.channel.name
            )
        ).toEqual(['Channel 2', 'Channel 10']);
    });

    it('filters category and unknown language independently and displays known facets', () => {
        const base = DEMO_CHANNELS[0];
        const channels = [
            {
                ...base,
                id: 'sport-unknown',
                country: 'ES',
                location: 'Spain',
                category: 'sports',
                language: 'Unknown',
            },
            {
                ...base,
                id: 'sport-spanish',
                country: 'ES',
                location: 'Spain',
                category: 'sports',
                language: 'Spanish',
            },
            {
                ...base,
                id: 'uncategorized',
                country: 'ES',
                location: 'Spain',
                category: 'unclassified',
                language: 'Unknown',
            },
        ];
        expect(
            filterChannels(channels, {
                ...empty,
                locations: ['ES'],
                categories: ['sports'],
            })
        ).toHaveLength(2);
        expect(
            filterChannels(channels, {
                ...empty,
                categories: ['sports'],
                languages: ['Unknown'],
            }).map((r) => r.channel.id)
        ).toEqual(['sport-unknown']);
        expect(
            filterChannels(channels, {
                ...empty,
                categories: ['unclassified'],
                languages: ['Unknown'],
            }).map((r) => r.channel.id)
        ).toEqual(['uncategorized']);
        expect(discoveryChannelLabel(channels[0])).toBe(
            'Spain · Sports · Unknown language'
        );
    });
    it('switches from the uncategorized section to known genres while retaining genre multi-select', () => {
        expect(toggleDiscoveryCategory(['unclassified'], 'sports')).toEqual([
            'sports',
        ]);
        expect(toggleDiscoveryCategory(['sports'], 'news')).toEqual([
            'sports',
            'news',
        ]);
        expect(
            toggleDiscoveryCategory(['sports', 'news'], 'unclassified')
        ).toEqual(['unclassified']);
        expect(
            toggleDiscoveryCategory(['unclassified'], 'unclassified')
        ).toEqual([]);
    });
    it('combines OR within a dimension and AND between dimensions', () => {
        const matches = filterChannels(DEMO_CHANNELS, {
            ...empty,
            locations: ['PE', 'BR'],
            categories: ['news', 'sports'],
            languages: ['Spanish'],
            qualities: ['HD', 'FHD'],
        });
        expect(matches.length).toBeGreaterThan(0);
        for (const { channel, sources } of matches) {
            expect(channel.country).toBe('PE');
            expect(['news', 'sports']).toContain(channel.category);
            expect(channel.language).toBe('Spanish');
            expect(
                sources.every((s) => ['HD', 'FHD'].includes(s.quality))
            ).toBe(true);
        }
    });
    it('keeps one card per logical channel while filtering its actual sources', () => {
        const all = filterChannels(DEMO_CHANNELS, empty);
        expect(new Set(all.map((c) => c.channel.id)).size).toBe(all.length);
        expect(all.some((c) => c.sources.length > 1)).toBe(true);
        const filtered = filterChannels(DEMO_CHANNELS, {
            ...empty,
            qualities: ['Unknown'],
        });
        expect(filtered.length).toBeGreaterThan(0);
        expect(
            filtered.every((c) =>
                c.sources.every((s) => s.quality === 'Unknown')
            )
        ).toBe(true);
    });
    it('keeps national and regional feeds separate and accepts state selections', () => {
        const matches = filterChannels(DEMO_CHANNELS, {
            ...empty,
            locations: ['US-CA', 'US-NY'],
            categories: ['news'],
        });
        expect(matches.map((c) => c.channel.state).sort()).toEqual([
            'US-CA',
            'US-NY',
        ]);
        expect(matches[0].channel.id).not.toBe(matches[1].channel.id);
    });
    it('treats empty selections as unrestricted and searches display metadata', () => {
        expect(filterChannels(DEMO_CHANNELS, empty)).toHaveLength(
            DEMO_CHANNELS.length
        );
        const results = filterChannels(DEMO_CHANNELS, {
            ...empty,
            query: '  peru  ',
        });
        expect(results).toHaveLength(11);
        expect(results.every((c) => c.channel.location === 'Peru')).toBe(true);
        expect(
            filterChannels(DEMO_CHANNELS, {
                ...empty,
                query: 'no-such-demo-channel',
            })
        ).toEqual([]);
    });
});

import { classifyDiscoveryStream } from '@iptvnator/portal/shared/util';
import {
    COUNTRIES,
    filterChannels,
    type DiscoveryFilters,
} from './discovery-catalog';
import { groupDiscoveryChannels } from './discovery-channel-groups';

const filters: DiscoveryFilters = {
    locations: [],
    categories: [],
    languages: [],
    qualities: [],
    query: '',
};
const first = {
    ...classifyDiscoveryStream(
        {
            source_id: 'synthetic',
            stream_id: 1,
            name: 'PE: Solis News HD Spanish',
        },
        COUNTRIES
    ),
    name: 'Solis',
};
const second = {
    ...classifyDiscoveryStream(
        {
            source_id: 'synthetic',
            stream_id: 2,
            name: 'US: Solis Sports FHD English',
        },
        COUNTRIES
    ),
    name: 'Solis',
};

describe('Discovery user-controlled channel groups', () => {
    it('groups only by the editable name, retaining provider titles, IDs and independent facets', () => {
        const input = [first, second];
        const before = JSON.stringify(input);
        const groups = groupDiscoveryChannels(
            input,
            new Map([[1, 'synthetic-logo.svg']])
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].sources.map((s) => [s.id, s.label])).toEqual([
            [first.id, first.provider.name],
            [second.id, second.provider.name],
        ]);
        expect(groups[0].sources.map((s) => s.facets?.country)).toEqual([
            'PE',
            'US',
        ]);
        expect(JSON.stringify(input)).toBe(before);
        expect(groupDiscoveryChannels([second, first], new Map())[0].id).toBe(
            groups[0].id
        );
    });
    it('leaves separate roots, case and quality suffixes under user control and deduplicates stream IDs', () => {
        expect(
            groupDiscoveryChannels(
                [first, { ...second, name: 'Solis HD' }],
                new Map()
            )
        ).toHaveLength(2);
        expect(
            groupDiscoveryChannels(
                [first, { ...second, name: 'solis' }],
                new Map()
            )
        ).toHaveLength(2);
        const groups = groupDiscoveryChannels(
            [first, { ...second, name: ' Solis ' }, first],
            new Map()
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].sources).toHaveLength(2);
        expect(
            groupDiscoveryChannels(
                [
                    first,
                    {
                        ...second,
                        provider: {
                            ...second.provider,
                            source_id: 'other-source',
                        },
                    },
                ],
                new Map()
            )
        ).toHaveLength(2);
    });
    it('requires the same alternate to match all dimensions and displays the matching alternate metadata', () => {
        const groups = groupDiscoveryChannels([first, second], new Map());
        const matches = filterChannels(groups, {
            ...filters,
            locations: ['US'],
            categories: ['sports'],
            languages: ['English'],
        });
        expect(matches).toHaveLength(1);
        expect(matches[0].sources.map((s) => s.id)).toEqual([second.id]);
        expect(matches[0].channel).toMatchObject({
            country: 'US',
            category: 'sports',
            language: 'English',
            location: 'United States',
        });
        expect(
            filterChannels(groups, {
                ...filters,
                locations: ['PE'],
                languages: ['English'],
            })
        ).toEqual([]);
        expect(
            filterChannels(groups, { ...filters, query: 'FHD' })[0].sources.map(
                (s) => s.id
            )
        ).toEqual([second.id]);
        expect(
            filterChannels(groups, { ...filters, qualities: ['HD'] })
        ).toEqual([]);
    });
});

describe('State facets on saved streams', () => {
    it('keeps regional alternates in one root group and filters each state independently', () => {
        const groups = groupDiscoveryChannels(
            [
                { ...second, state: 'US-FL' },
                {
                    ...second,
                    id: 'synthetic-other',
                    provider: { ...second.provider, stream_id: 3 },
                    state: 'US-OH',
                },
                {
                    ...second,
                    id: 'synthetic-national',
                    provider: { ...second.provider, stream_id: 4 },
                },
            ],
            new Map()
        );
        expect(groups).toHaveLength(1);
        const regional = filterChannels(groups, {
            ...filters,
            locations: ['US-OH'],
        });
        expect(regional[0].sources).toHaveLength(1);
        expect(regional[0].channel).toMatchObject({
            state: 'US-OH',
            location: 'Ohio, United States',
        });
        expect(
            filterChannels(groups, { ...filters, locations: ['US'] })[0].sources
        ).toHaveLength(3);
        expect(
            filterChannels(groups, { ...filters, locations: ['US-CA'] })
        ).toEqual([]);
    });
    it('filters each stream by its declared quality and defaults historical mappings to Unknown', () => {
        const groups = groupDiscoveryChannels(
            [
                { ...first, quality: 'HD' },
                { ...second, quality: 'FHD' },
            ],
            new Map()
        );
        expect(
            filterChannels(groups, {
                ...filters,
                qualities: ['HD'],
            })[0].sources.map((s) => s.id)
        ).toEqual([first.id]);
        expect(
            filterChannels(groups, {
                ...filters,
                qualities: ['FHD'],
            })[0].sources.map((s) => s.id)
        ).toEqual([second.id]);
        expect(
            filterChannels(groups, { ...filters, qualities: ['SD'] })
        ).toEqual([]);
        expect(
            groupDiscoveryChannels([first], new Map())[0].sources[0].quality
        ).toBe('Unknown');
    });
});

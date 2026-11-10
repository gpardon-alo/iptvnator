import {
    mergeDiscoveryBaseline,
    parseDiscoveryBaseline,
} from './discovery-baseline';
import { type ClassifiedStream } from './discovery-classification';

const row: ClassifiedStream = {
    id: 'local:desktop-source:live:10',
    name: 'Synthetic News',
    categories: ['United States', 'News', 'English'],
    provider: {
        source_id: 'desktop-source',
        stream_id: 10,
        name: 'Synthetic News HD',
    },
    country: 'US',
    state: 'US-FL',
    category: 'news',
    language: 'English',
    status: 'classified',
    origin: 'manual',
    ruleVersion: 4,
};
const manifest = () => ({
    schemaVersion: 1,
    baselines: [
        {
            sourceId: 'desktop-source',
            version: 1,
            rows: [
                {
                    ...row,
                    provider: { ...row.provider },
                    categories: [...row.categories],
                },
            ],
        },
    ],
});

describe('Discovery baseline validation and merge', () => {
    it('preserves root names, provider identities, independent facets and states', () => {
        expect(parseDiscoveryBaseline(manifest()).baselines[0].rows).toEqual([
            row,
        ]);
        expect(
            parseDiscoveryBaseline({ schemaVersion: 1, baselines: [] })
                .baselines
        ).toEqual([]);
    });
    it('rejects credentials, duplicate IDs, source mismatches and invalid state associations', () => {
        const values = [
            { ...manifest(), password: 'synthetic-secret' },
            { ...manifest(), schemaVersion: 2 },
            {
                schemaVersion: 1,
                baselines: [{ ...manifest().baselines[0], version: 0 }],
            },
            {
                schemaVersion: 1,
                baselines: [{ ...manifest().baselines[0], rows: [row, row] }],
            },
            {
                schemaVersion: 1,
                baselines: [
                    {
                        ...manifest().baselines[0],
                        rows: [
                            {
                                ...row,
                                provider: {
                                    ...row.provider,
                                    password: 'synthetic-secret',
                                },
                            },
                        ],
                    },
                ],
            },
            {
                schemaVersion: 1,
                baselines: [
                    { ...manifest().baselines[0], sourceId: 'wrong-source' },
                ],
            },
            {
                schemaVersion: 1,
                baselines: [
                    {
                        ...manifest().baselines[0],
                        rows: [{ ...row, country: 'PE' }],
                    },
                ],
            },
        ];
        values.forEach((value) =>
            expect(() => parseDiscoveryBaseline(value)).toThrow()
        );
    });
    it('keeps every existing desktop record intact and adds only absent identities', () => {
        const baseline = parseDiscoveryBaseline(manifest()).baselines[0];
        const existing = {
            ...row,
            name: 'Desktop correction',
            language: '',
            state: 'US-OH',
            status: 'unclassified' as const,
        };
        const absent = {
            ...row,
            id: 'local:desktop-source:live:11',
            provider: { ...row.provider, stream_id: 11 },
        };
        const merged = mergeDiscoveryBaseline([existing, absent], baseline);
        expect(merged).toEqual([existing, absent]);
        expect(mergeDiscoveryBaseline([], baseline)).toEqual([row]);
    });
    it.each(['4K', 'FHD', 'HD', 'SD', 'Unknown'])(
        'accepts optional %s quality in stored mappings and baselines',
        (quality) => {
            const value = manifest();
            Object.assign(value.baselines[0].rows[0], { quality });
            expect(
                parseDiscoveryBaseline(value).baselines[0].rows[0].quality
            ).toBe(quality);
        }
    );
    it.each(['', 'UHD', 'hd', null, 1080])(
        'rejects unsupported quality %p',
        (quality) => {
            const value = manifest();
            Object.assign(value.baselines[0].rows[0], { quality });
            expect(() => parseDiscoveryBaseline(value)).toThrow();
        }
    );
});

import { classifyDiscoveryStream } from '@iptvnator/portal/shared/util';
import { COUNTRIES } from './discovery-catalog';
import {
    discoveryDictionaryRows,
    parseDiscoveryDictionary,
} from './discovery-dictionary';

const row = () =>
    classifyDiscoveryStream(
        {
            source_id: 'synthetic',
            stream_id: 10,
            name: 'Synthetic News',
            category_name: 'Synthetic folder',
        },
        COUNTRIES
    );

describe('Discovery dictionary round trips', () => {
    it.each([
        {},
        { xmltvId: 'SyntheticNews.example@SD' },
        {
            source: null,
            id: null,
            xmltvId: null,
            status: 'unmatched',
            reason: 'No exact synthetic match',
        },
        {
            source: null,
            id: null,
            xmltvId: null,
            status: 'skipped',
            reason: 'Synthetic entry excluded',
        },
        {
            source: null,
            id: null,
            xmltvId: null,
            status: 'review',
            reason: 'Multiple synthetic candidates',
        },
        {
            source: 'example.test',
            id: 'synthetic-native-id',
            xmltvId: null,
            language: 'en',
            channelsFile: 'sites/example.test/example.test.channels.xml',
            status: 'matched',
            method: 'reviewed',
        },
        {
            source: null,
            id: null,
            xmltvId: null,
            language: null,
            channelsFile: null,
            status: null,
            method: null,
            reason: null,
        },
    ])('preserves omitted and nullable EPG fields: %j', (epg) => {
        const first = row();
        delete first.provider.category_name;
        const imported = parseDiscoveryDictionary(
            JSON.stringify([{ ...first, epg }]),
            'synthetic',
            []
        );
        const exported = discoveryDictionaryRows(imported);
        const restored = parseDiscoveryDictionary(
            JSON.stringify(exported),
            'synthetic',
            []
        );
        expect(restored[0].epg).toEqual(epg);
        expect(restored[0].provider.category_name).toBeUndefined();
    });

    it('round-trips optional EPG metadata and rejects unsafe or malformed fields', () => {
        const epg = {
            source: 'example.test',
            id: '123',
            xmltvId: 'ExampleNews.test@SD',
            language: 'en',
            channelsFile: 'sites/example/channels.xml',
            status: 'matched',
            method: 'exact-name-country',
        };
        const imported = parseDiscoveryDictionary(
            JSON.stringify([{ ...row(), epg }]),
            'synthetic',
            []
        );
        expect(discoveryDictionaryRows(imported)[0].epg).toEqual(epg);
        for (const invalid of [
            null,
            [],
            { xmltvId: 123 },
            { reason: { text: 'Malformed synthetic reason' } },
            { source: false },
            { ...epg, url: 'https://example.test' },
        ]) {
            expect(() =>
                parseDiscoveryDictionary(
                    JSON.stringify([{ ...row(), epg: invalid }]),
                    'synthetic',
                    []
                )
            ).toThrow('Entry 1');
        }
        expect(() =>
            parseDiscoveryDictionary(
                JSON.stringify([
                    { ...row(), epg },
                    { ...row(), epg: { ...epg, xmltvId: 'Other.test' } },
                ]),
                'synthetic',
                []
            )
        ).toThrow('Entry 2');
    });
    it('exports the first occurrence of each source-scoped ID, matching the screen', () => {
        const first = row();
        const duplicate = {
            ...first,
            provider: {
                ...first.provider,
                category_name: 'Other synthetic folder',
            },
        };
        expect(discoveryDictionaryRows([first, duplicate])).toEqual([first]);
        expect(
            parseDiscoveryDictionary(
                JSON.stringify(discoveryDictionaryRows([first, duplicate])),
                'synthetic',
                [first]
            )
        ).toHaveLength(1);
    });
    it('validates every duplicate before merging, including hidden unsupported fields', () => {
        const first = row();
        expect(() =>
            parseDiscoveryDictionary(
                JSON.stringify([first, { ...first, extra: 'unsupported' }]),
                'synthetic',
                [first]
            )
        ).toThrow('Entry 2');
    });
    it('ignores stale derived summaries when merging identical editable fields', () => {
        const first = row();
        const rows = parseDiscoveryDictionary(
            JSON.stringify([
                first,
                {
                    ...first,
                    categories: ['Stale'],
                    status: 'unclassified',
                    origin: 'manual',
                    ruleVersion: 1,
                },
            ]),
            'synthetic',
            []
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].categories).toEqual(['News']);
        expect(rows[0].origin).toBe('manual');
    });
    it('reports category errors by entry number without echoing imported values', () => {
        const invalid = { ...row(), category: 'synthetic-invalid-value' };
        expect(() =>
            parseDiscoveryDictionary(JSON.stringify([invalid]), 'synthetic', [])
        ).toThrow('Entry 1 has an unsupported category');
        expect(() =>
            parseDiscoveryDictionary(JSON.stringify([invalid]), 'synthetic', [])
        ).not.toThrow('synthetic-invalid-value');
    });
    it('accepts and round-trips an explicit quality alongside classification fields', () => {
        const first = { ...row(), quality: 'HD' };
        const rows = parseDiscoveryDictionary(
            JSON.stringify([first]),
            'synthetic',
            []
        );
        expect(rows[0]).toMatchObject({ quality: 'HD', origin: 'manual' });
        expect(discoveryDictionaryRows(rows)[0].quality).toBe('HD');
    });

    it('rejects duplicate entries whose declared qualities conflict', () => {
        const first = { ...row(), quality: 'HD' };
        expect(() =>
            parseDiscoveryDictionary(
                JSON.stringify([first, { ...first, quality: 'SD' }]),
                'synthetic',
                []
            )
        ).toThrow('conflicting names or classifications');
    });
    it('preserves the first catalog provider evidence when a stream is in multiple folders', () => {
        const first = row();
        const otherFolder = {
            ...first,
            provider: {
                ...first.provider,
                category_name: 'Synthetic English folder',
            },
        };
        const imported = parseDiscoveryDictionary(
            JSON.stringify([first]),
            'synthetic',
            [first, otherFolder]
        );
        expect(imported[0].provider).toEqual(first.provider);
    });
});

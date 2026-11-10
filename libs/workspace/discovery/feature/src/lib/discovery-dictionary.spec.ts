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
});

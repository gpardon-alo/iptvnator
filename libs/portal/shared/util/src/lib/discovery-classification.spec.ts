import { discoveryLocationIds } from './discovery-us-states';
import {
    classifyDiscoveryStream,
    finishDiscoveryClassification,
    discoveryMissingFields,
    discoverySuggestedLanguage,
    discoveryStreamId,
    reconcileDiscoveryMappings,
} from './discovery-classification';

const locations = [
    { id: 'PE', name: 'Peru', language: 'Spanish' },
    { id: 'US', name: 'United States', language: 'English' },
];
const provider = {
    source_id: 'synthetic-source',
    stream_id: 101,
    name: 'PE: Solis Noticias Spanish HD',
};

describe('Discovery classification mappings', () => {
    it('classifies DAZN names and collections as Sports ahead of generic genre hints', () => {
        for (const sample of [
            {
                name: 'PE: DAZN Synthetic Movies English',
                category_name: 'News',
            },
            {
                name: 'PE: Synthetic Movies English',
                category_name: 'DAZN events',
            },
        ]) {
            const row = classifyDiscoveryStream(
                { ...provider, ...sample },
                locations
            );
            expect(row).toMatchObject({
                country: 'PE',
                language: 'English',
                category: 'sports',
            });
            expect(
                classifyDiscoveryStream(
                    { ...provider, ...sample },
                    locations,
                    false
                ).category
            ).toBe('');
        }
        expect(
            classifyDiscoveryStream(
                { ...provider, name: 'Synthetic DAZNextra' },
                locations
            ).category
        ).toBe('');
    });
    it.each([
        ['RD', 'DO', 'Dominican Republic'],
        ['CR', 'CR', 'Costa Rica'],
        ['PANAMA', 'PA', 'Panama'],
        ['MX', 'MX', 'Mexico'],
    ])(
        'uses the | %s country and Spanish policy ahead of broad folder hints',
        (suffix, id, name) => {
            const row = classifyDiscoveryStream(
                {
                    ...provider,
                    name: `Solis Sports | ${suffix.toLowerCase()} `,
                    category_name: 'United States English',
                },
                [...locations, { id, name, language: 'Spanish' }]
            );
            expect(row.country).toBe(id);
            expect(row.language).toBe('Spanish');
            expect(row.category).toBe('sports');
            expect(row.status).toBe('classified');
        }
    );
    it('requires a complete pipe-delimited suffix and keeps existing languages on fill', () => {
        const regional = [
            ...locations,
            { id: 'DO', name: 'Dominican Republic', language: 'Spanish' },
        ];
        for (const name of [
            'Solis Sports RD',
            'Solis Sports | RDX',
            'Solis Sports | RD Extra',
        ]) {
            expect(
                classifyDiscoveryStream({ ...provider, name }, regional).country
            ).toBe('');
        }
        expect(
            discoverySuggestedLanguage({
                country: 'DO',
                language: 'French',
                provider: { ...provider, name: 'Solis | RD' },
            })
        ).toBe('French');
        const pending = classifyDiscoveryStream(
            { ...provider, name: 'Solis | RD' },
            regional,
            false
        );
        expect(pending.country).toBe('');
        expect(pending.language).toBe('');
    });
    it('maps explicit country, genre and language while retaining provider evidence', () => {
        const row = classifyDiscoveryStream(provider, locations);
        expect(row.categories).toEqual(['Peru', 'News', 'Spanish']);
        expect(row.status).toBe('classified');
        expect(row.provider).toEqual(provider);
        expect(row.name).toBe(provider.name);
        expect(row).not.toHaveProperty('quality');
    });
    it('keeps missing and conflicting dimensions unclassified', () => {
        expect(
            classifyDiscoveryStream(
                { ...provider, name: 'Unspecified channel' },
                locations
            ).categories
        ).toEqual([]);
        const row = classifyDiscoveryStream(
            { ...provider, name: 'PE: US: Solis News Spanish English' },
            locations
        );
        expect(row.language).toBe('');
        expect(row.status).toBe('unclassified');
    });
    it('defaults a missing language from country without inventing a genre', () => {
        const row = classifyDiscoveryStream(
            { ...provider, name: 'PE: Solis' },
            locations
        );
        expect(row.country).toBe('PE');
        expect(row.language).toBe('Spanish');
        expect(row.category).toBe('');
    });
    it.each([
        ['PE', 'Spanish'],
        ['MX', 'Spanish'],
        ['GT', 'Spanish'],
        ['BR', 'Portuguese'],
        ['BZ', 'English'],
        ['GY', 'English'],
        ['SR', 'Dutch'],
        ['GF', 'French'],
        ['FR', 'French'],
        ['GB', 'English'],
        ['DE', 'German'],
        ['PT', 'Portuguese'],
        ['NL', 'Dutch'],
        ['TR', 'Turkish'],
        ['QA', 'Arabic'],
        ['CA', ''],
        ['CH', ''],
        ['IN', ''],
        ['', ''],
    ])('uses the editable default for %s', (country, expected) => {
        expect(
            discoverySuggestedLanguage({
                country,
                language: '',
                provider: { ...provider, name: 'Solis' },
            })
        ).toBe(expected);
    });
    it('retains populated languages and prefers explicit hints over national defaults', () => {
        expect(
            discoverySuggestedLanguage({
                country: 'PE',
                language: 'French',
                provider,
            })
        ).toBe('French');
        expect(
            discoverySuggestedLanguage({
                country: 'PE',
                language: '',
                provider: { ...provider, name: 'Solis English' },
            })
        ).toBe('English');
        expect(
            discoverySuggestedLanguage({
                country: 'PE',
                language: '',
                provider: { ...provider, name: 'Solis Spanish English' },
            })
        ).toBe('');
    });
    it('uses provider folders as evidence and prefers a specific stream genre', () => {
        const row = classifyDiscoveryStream(
            {
                ...provider,
                name: 'Solis Noticias',
                category_name: 'Peru Sports Spanish',
            },
            locations
        );
        expect(row.categories).toEqual(['Peru', 'News', 'Spanish']);
    });
    it('separates source identities and regional variants', () => {
        expect(discoveryStreamId('a', 1)).not.toBe(discoveryStreamId('b', 1));
        const rows = reconcileDiscoveryMappings(
            [
                { ...provider, stream_id: 1 },
                { ...provider, stream_id: 2 },
            ],
            [],
            locations
        );
        expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    });
    it('preserves manual classifications on refresh and leaves newly discovered streams pending', () => {
        const manual = {
            ...classifyDiscoveryStream(provider, locations),
            name: 'My channel',
            origin: 'manual' as const,
        };
        const renamed = { ...provider, name: 'PE: Solis provider rename' };
        const rows = reconcileDiscoveryMappings(
            [renamed, { ...provider, stream_id: 202 }],
            [manual],
            locations
        );
        expect(rows[0].name).toBe('My channel');
        expect(rows[0].provider.name).toBe(renamed.name);
        expect(rows[0].origin).toBe('manual');
        expect(rows[1].status).toBe('unclassified');
        expect(rows[1].ruleVersion).toBe(0);
    });
});

describe('Optional US state classification', () => {
    const national = classifyDiscoveryStream(
        { ...provider, name: 'US: Synthetic News English' },
        locations
    );
    it('keeps state optional and independent from classification completeness', () => {
        expect(discoveryMissingFields(national)).toEqual([]);
        expect(national.state).toBeUndefined();
        const regional = finishDiscoveryClassification(
            { ...national, state: 'US-FL' },
            locations
        );
        expect(regional.state).toBe('US-FL');
        expect(regional.status).toBe('classified');
        expect(regional.categories).toEqual(national.categories);
        expect(
            finishDiscoveryClassification(
                { ...regional, country: 'PE' },
                locations
            ).state
        ).toBe('');
        expect(
            finishDiscoveryClassification(
                { ...regional, state: 'US-INVALID' },
                locations
            ).state
        ).toBe('');
    });
    it('retains a saved state and portable identity across provider refresh', () => {
        const regional = { ...national, state: 'US-OH' };
        const refreshed = reconcileDiscoveryMappings(
            [{ ...regional.provider, name: 'Renamed synthetic alternate' }],
            [regional],
            locations
        );
        expect(refreshed[0]).toMatchObject({ state: 'US-OH', id: regional.id });
    });
});

describe('Map state availability', () => {
    it('includes all regional alternates, deduplicates countries and ignores invalid/cross-country states', () => {
        expect(
            discoveryLocationIds([
                { country: 'US', state: 'US-FL' },
                { country: 'US', state: 'US-OH' },
                { country: 'US' },
                { country: 'PE', state: 'US-NY' },
                { country: 'US', state: 'US-INVALID' },
            ])
        ).toEqual(['US', 'US-FL', 'US-OH', 'PE']);
    });
});

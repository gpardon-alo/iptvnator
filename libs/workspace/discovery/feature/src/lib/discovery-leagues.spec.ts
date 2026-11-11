import {
    DEMO_CHANNELS,
    filterChannels,
    type DiscoveryFilters,
} from './discovery-catalog';
import { DISCOVERY_LEAGUES, matchesDiscoveryLeague } from './discovery-leagues';

describe('Discovery tournament shortcuts', () => {
    it.each(DISCOVERY_LEAGUES)(
        'matches all requested aliases for $name',
        (league) => {
            for (const phrase of league.phrases) {
                expect(
                    matchesDiscoveryLeague(
                        league.id,
                        `Synthetic | ${phrase.toUpperCase()} | HD`,
                        ''
                    )
                ).toBe(true);
                expect(
                    matchesDiscoveryLeague(
                        league.id,
                        'Synthetic channel',
                        `Synthetic ${phrase} feed`
                    )
                ).toBe(true);
            }
        }
    );
    it('handles accents, punctuation and repeated whitespace without partial acronym matches', () => {
        expect(
            matchesDiscoveryLeague(
                'champions-league',
                'Synthetic LIGA-DE-CAMPEONES HD',
                ''
            )
        ).toBe(true);
        expect(
            matchesDiscoveryLeague('laliga', 'Synthetic La   Liga HD', '')
        ).toBe(true);
        expect(matchesDiscoveryLeague('nba', 'Synthetic WNBA feed', '')).toBe(
            false
        );
        expect(
            matchesDiscoveryLeague('liga-1-peru', 'Synthetic Liga 10', '')
        ).toBe(false);
        expect(
            matchesDiscoveryLeague(
                'brasileirao',
                'Synthetic Premier League',
                ''
            )
        ).toBe(false);
        expect(matchesDiscoveryLeague('unknown', 'Synthetic NBA', '')).toBe(
            false
        );
    });
    it('filters each alternate stream independently and combines with the existing filters', () => {
        const channel = {
            ...DEMO_CHANNELS[0],
            name: 'Synthetic shared channel',
            country: 'ES',
            language: 'Spanish',
            sources: [
                {
                    id: 'synthetic-one',
                    label: 'Synthetic La Liga HD',
                    quality: 'HD' as const,
                },
                {
                    id: 'synthetic-two',
                    label: 'Synthetic NBA HD',
                    quality: 'HD' as const,
                },
            ],
        };
        const filters: DiscoveryFilters = {
            league: 'laliga',
            locations: [],
            categories: [],
            languages: ['Spanish'],
            qualities: ['HD'],
            query: 'shared',
        };
        const matches = filterChannels([channel], filters);
        expect(matches).toHaveLength(1);
        expect(matches[0].sources.map((source) => source.id)).toEqual([
            'synthetic-one',
        ]);
        expect(
            filterChannels([channel], { ...filters, languages: ['English'] })
        ).toHaveLength(0);
        expect(
            filterChannels([channel], { ...filters, league: '' })[0].sources
        ).toHaveLength(2);
    });
});

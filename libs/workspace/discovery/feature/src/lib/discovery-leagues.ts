/** Public tournament shortcuts; phrases are matched against channel/provider names. */
export const DISCOVERY_LEAGUES = [
    { id: 'laliga', name: 'LaLiga (Spain)', phrases: ['LaLiga', 'La Liga'] },
    {
        id: 'champions-league',
        name: 'UEFA Champions League',
        phrases: ['Liga de Campeones', 'Champions League'],
    },
    {
        id: 'nations-league',
        name: 'UEFA Nations League',
        phrases: ['Nations League'],
    },
    {
        id: 'premier-league',
        name: 'Premier League',
        phrases: ['Premier League'],
    },
    { id: 'bundesliga', name: 'Bundesliga', phrases: ['Bundesliga'] },
    { id: 'serie-a', name: 'Serie A (Italy)', phrases: ['Serie A'] },
    {
        id: 'ligue-1',
        name: 'Ligue 1 (France)',
        phrases: ['Ligue 1', 'Amazon League'],
    },
    { id: 'liga-portugal', name: 'Liga Portugal', phrases: ['Liga Portugal'] },
    { id: 'liga-mx', name: 'Liga MX', phrases: ['Liga MX'] },
    { id: 'mls', name: 'MLS', phrases: ['MLS'] },
    { id: 'liga-1-peru', name: 'Liga 1 (Peru)', phrases: ['Liga 1'] },
    {
        id: 'liga-chile',
        name: 'Liga de Primera (Chile)',
        phrases: ['Liga Chile'],
    },
    {
        id: 'primera-a',
        name: 'Primera A / BetPlay (Colombia)',
        phrases: ['Primera A'],
    },
    { id: 'brasileirao', name: 'Brasileirão', phrases: ['Premiere'] },
    { id: 'nba', name: 'NBA', phrases: ['NBA'] },
    { id: 'nhl', name: 'NHL', phrases: ['NHL'] },
    { id: 'nfl', name: 'NFL', phrases: ['NFL'] },
    { id: 'mlb', name: 'MLB', phrases: ['MLB'] },
] as const;

function normalizeName(value: string): string {
    return ` ${value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()} `;
}
const PHRASES = new Map<string, string[]>(
    DISCOVERY_LEAGUES.map((league) => [
        league.id,
        league.phrases.map(normalizeName),
    ])
);

export function matchesDiscoveryLeague(
    id: string | undefined,
    name: string,
    providerName: string
): boolean {
    if (!id) return true;
    const phrases = PHRASES.get(id);
    if (!phrases) return false;
    return [name, providerName].some((value) => {
        const normalized = normalizeName(value);
        return phrases.some((phrase) => normalized.includes(phrase));
    });
}

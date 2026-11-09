import { discoveryState } from './discovery-us-states';
import { DISCOVERY_LANGUAGE_DEFAULTS } from './discovery-language-defaults';

/** Provider references are scoped to a source and live content, never a DB row ID. */
export interface DiscoveryProviderStream {
    source_id: string;
    stream_id: number;
    name: string;
    category_name?: string;
}
export interface ClassifiedStream {
    id: string;
    name: string;
    /** Derived display labels; country/category/language remain authoritative. */
    categories: string[];
    provider: DiscoveryProviderStream;
    country: string;
    /** Optional US subdivision, e.g. US-FL; absent for nationwide/unknown. */
    state?: string;
    category: string;
    language: string;
    status: 'classified' | 'unclassified';
    origin: 'rules' | 'manual';
    ruleVersion: number;
}
export interface ClassificationLocation {
    id: string;
    name: string;
    language: string;
}
export const DISCOVERY_CLASSIFICATION_VERSION = 4;
export const CLASSIFICATION_GENRES = [
    ['general', 'General TV', 'general tv|general television'],
    ['news', 'News', 'news|noticias|notizie|actualites'],
    ['sports', 'Sports', 'sports?|deportes?|esportes?|sport'],
    ['movies', 'Movies & Series', 'movies?|cinema|cine|peliculas|series'],
    ['entertainment', 'Entertainment', 'entertainment|entretenimiento'],
    ['kids', 'Kids', 'kids|children|infantil|infantiles|ninos'],
    [
        'documentaries',
        'Documentaries',
        'documentary|documentaries|documentales',
    ],
    ['music', 'Music', 'music|musica'],
    ['lifestyle', 'Lifestyle', 'lifestyle|estilo de vida'],
    ['education', 'Education', 'education|educacion|educativo'],
    ['religion', 'Religion', 'religion|religioso|religiosos|religious'],
] as const;
const LANGUAGE_HINTS = [
    ['Spanish', 'spanish|espanol|castellano'],
    ['English', 'english|ingles'],
    ['Portuguese', 'portuguese|portugues'],
    ['French', 'french|francais'],
    ['German', 'german|deutsch'],
    ['Italian', 'italian|italiano'],
    ['Japanese', 'japanese|japones'],
    ['Hindi', 'hindi'],
    ['Dutch', 'dutch|nederlands'],
    ['Turkish', 'turkish|turkce'],
    ['Arabic', 'arabic|arabe'],
    ['Haitian Creole', 'haitian creole|kreyol'],
    ['Papiamento', 'papiamento'],
] as const;
const COUNTRY_ALIASES: Record<string, string> = {
    US: 'usa|united states|estados unidos',
    GB: 'uk|united kingdom',
    PE: 'peru',
    BR: 'brasil|brazil',
    MX: 'mexico',
    ES: 'espana|spain',
};
const COUNTRY_SUFFIXES: Record<string, string> = {
    RD: 'DO',
    CR: 'CR',
    PANAMA: 'PA',
    MX: 'MX',
};
const countryFromSuffix = (name: string): string => {
    const suffix = name.match(/\|\s*(RD|CR|PANAMA|MX)\s*$/i)?.[1];
    return suffix ? COUNTRY_SUFFIXES[suffix.toUpperCase()] : '';
};
const normalize = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
const contains = (value: string, alternatives: string) =>
    new RegExp(`(?:^|[^a-z0-9])(?:${alternatives})(?=$|[^a-z0-9])`, 'i').test(
        value
    );
const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function discoveryStreamId(sourceId: string, streamId: number): string {
    return `local:${encodeURIComponent(sourceId)}:live:${streamId}`;
}

/** Completeness is review metadata; each facet remains usable independently. */
export function discoveryMissingFields(
    row: Pick<ClassifiedStream, 'country' | 'category' | 'language'>
): string[] {
    return ['country', 'category', 'language'].filter(
        (field) => !row[field as keyof typeof row]
    );
}

/** Explicit conflicting languages stay unresolved; defaults fill absent hints only. */
export function discoverySuggestedLanguage(
    row: Pick<ClassifiedStream, 'country' | 'language' | 'provider'>
): string {
    if (row.language) return row.language;
    // These feed tags carry an explicit user-defined Spanish-language policy.
    if (countryFromSuffix(row.provider.name)) return 'Spanish';
    const text = normalize(
        `${row.provider.name} ${row.provider.category_name ?? ''}`
    );
    const hints = LANGUAGE_HINTS.filter((hint) => contains(text, hint[1]));
    return hints.length === 1
        ? hints[0][0]
        : hints.length > 1
          ? ''
          : (DISCOVERY_LANGUAGE_DEFAULTS[row.country] ?? '');
}

/** Country/genre conflicts stay unresolved; language defaults remain editable. */
export function classifyDiscoveryStream(
    provider: DiscoveryProviderStream,
    locations: readonly ClassificationLocation[],
    classify = true
): ClassifiedStream {
    const name = normalize(provider.name);
    const folder = normalize(provider.category_name ?? '');
    const text = `${name} ${folder}`;
    const suffixCountry = classify ? countryFromSuffix(provider.name) : '';
    const countries = classify
        ? locations.filter((location) => {
              if (suffixCountry) return location.id === suffixCountry;
              const countryNames = `${escapeRegex(normalize(location.name))}|${COUNTRY_ALIASES[location.id] ?? '(?!)'}`;
              // Short country codes count only as a delimited prefix or a whole folder.
              const prefix = new RegExp(`^\\s*${location.id}\\s*[:|_-]`, 'i');
              return (
                  prefix.test(provider.name) ||
                  folder === location.id.toLowerCase() ||
                  contains(text, countryNames)
              );
          })
        : [];
    const country = countries.length === 1 ? countries[0].id : '';
    const nameGenres = classify
        ? CLASSIFICATION_GENRES.filter((g) => contains(name, g[2]))
        : [];
    const genres = nameGenres.length
        ? nameGenres
        : classify
          ? CLASSIFICATION_GENRES.filter((g) => contains(folder, g[2]))
          : [];
    const category =
        classify && contains(text, 'dazn')
            ? 'sports'
            : genres.length === 1
              ? genres[0][0]
              : '';
    const language = classify
        ? discoverySuggestedLanguage({ country, language: '', provider })
        : '';
    return finishDiscoveryClassification(
        {
            id: discoveryStreamId(provider.source_id, provider.stream_id),
            name: provider.name,
            categories: [],
            provider,
            country,
            category,
            language,
            status: 'unclassified',
            origin: 'rules',
            ruleVersion: classify ? DISCOVERY_CLASSIFICATION_VERSION : 0,
        },
        locations
    );
}

export function finishDiscoveryClassification(
    row: ClassifiedStream,
    locations: readonly ClassificationLocation[]
): ClassifiedStream {
    const place = locations.find((l) => l.id === row.country);
    const genre = CLASSIFICATION_GENRES.find((g) => g[0] === row.category);
    return {
        ...row,
        ...(row.state !== undefined ? { state: discoveryState(row) } : {}),
        categories: [place?.name, genre?.[1], row.language].filter(
            (v): v is string => Boolean(v)
        ),
        status: place && genre && row.language ? 'classified' : 'unclassified',
    };
}

/** Retain user fields, but always refresh the original provider evidence. */
export function reconcileDiscoveryMappings(
    providers: DiscoveryProviderStream[],
    saved: ClassifiedStream[],
    locations: readonly ClassificationLocation[]
): ClassifiedStream[] {
    const byId = new Map(saved.map((row) => [row.id, row]));
    return providers.map((provider) => {
        const id = discoveryStreamId(provider.source_id, provider.stream_id);
        const previous = byId.get(id);
        return previous
            ? { ...previous, provider }
            : classifyDiscoveryStream(provider, locations, false);
    });
}

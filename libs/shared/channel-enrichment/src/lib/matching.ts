import type { LogoCandidate } from '@iptvnator/shared/interfaces/channel-enrichment';

/** Remove transport-quality suffixes, never regional names, digits or +1. */
export function logoNameKey(name: string): string {
    return name
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .replace(/(?:\s+|\s*\|\s*)(?:uhd|fhd|hd|sd|4k)\s*$/i, '')
        .replace(/[\s|]+/g, ' ')
        .trim();
}

export function logoIdentity(
    title: string,
    country = ''
): { name: string; country: string } {
    const prefix = /^\s*([A-Z]{2})\s*[|:]\s*(.+)$/i.exec(title);
    const suffix = /^(.+?)\s*\|\s*([A-Z]{2})\s*$/i.exec(title);
    const hint = prefix?.[1] ?? suffix?.[2] ?? '';
    // Conflicting explicit evidence is unresolved, not guessed.
    if (country && hint && country.toUpperCase() !== hint.toUpperCase())
        return { name: '', country: '!' };
    return {
        name: logoNameKey(prefix?.[2] ?? suffix?.[1] ?? title),
        country: (country || hint).toUpperCase(),
    };
}

/** Catalog is indexed once; ambiguity always causes abstention. */
export class LogoCatalogIndex {
    private readonly ids = new Map<string, LogoCandidate[]>();
    private readonly names = new Map<string, LogoCandidate[]>();

    add(candidate: LogoCandidate): void {
        const add = (map: Map<string, LogoCandidate[]>, key: string) => {
            const values = map.get(key) ?? [];
            if (!values.some((item) => item.id === candidate.id))
                values.push(candidate);
            map.set(key, values);
        };
        add(this.ids, candidate.id.toLowerCase());
        for (const name of new Set(candidate.names.map(logoNameKey))) {
            if (name) add(this.names, `${candidate.country}:${name}`);
        }
    }

    match(title: string, epgId: string, country = ''): LogoCandidate | null {
        const identity = logoIdentity(title, country);
        const exact = this.ids.get(epgId.trim().toLowerCase()) ?? [];
        if (exact.length === 1) {
            if (identity.country && exact[0].country !== identity.country)
                return null;
            return exact[0];
        }
        if (!identity.country || !identity.name) return null;
        const values =
            this.names.get(`${identity.country}:${identity.name}`) ?? [];
        return values.length === 1 ? values[0] : null;
    }
}

import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate as yieldToMain } from 'node:timers/promises';
import {
    LOGO_DAY,
    LogoCatalogIndex,
    type LogoCandidate,
} from '@iptvnator/shared/channel-enrichment';
import { requestWithValidatedRedirects } from '../util/validated-axios';

export interface LogoCatalogChannel {
    id: string;
    name: string;
    country: string;
    alt_names?: string[];
    closed?: string | null;
}
export interface LogoCatalogImage {
    channel: string;
    feed: string | null;
    url: string;
    in_use: boolean;
    format: string;
    width: number;
    height: number;
}
interface CatalogSnapshot {
    updated: number;
    channels: LogoCatalogChannel[];
    logos: LogoCatalogImage[];
}

/** Only the isolated Electron E2E runtime may point the catalog at a loopback fixture. */
export function logoFixtureRoot(): string | null {
    const root = process.env['IPTVNATOR_E2E_LOGO_ROOT'];
    return process.env['IPTVNATOR_E2E_DATA_DIR'] &&
        root &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(root)
        ? root
        : null;
}

export async function fetchLogoResource(
    url: string,
    signal: AbortSignal,
    maxBytes: number
): Promise<Buffer> {
    const fixture = logoFixtureRoot();
    const response = await requestWithValidatedRedirects<ArrayBuffer>(
        url,
        {
            responseType: 'arraybuffer',
            timeout: 15_000,
            signal,
            maxContentLength: maxBytes,
            maxBodyLength: maxBytes,
            headers: {
                Accept: 'application/json,image/png,image/jpeg',
                'User-Agent': 'IPTVnator-channel-logos',
            },
        },
        {
            allowPrivateNetworks: !!fixture && new URL(url).origin === fixture,
            allowPrivateNetworkRedirects: false,
        }
    );
    const bytes = Buffer.from(response.data);
    if (bytes.length > maxBytes) throw new Error('Logo resource exceeds limit');
    return bytes;
}

export function parseLogoCatalog(value: unknown): CatalogSnapshot {
    if (!value || typeof value !== 'object')
        throw new Error('Invalid logo catalog');
    const snapshot = value as CatalogSnapshot;
    if (
        !Number.isFinite(snapshot.updated) ||
        !Array.isArray(snapshot.channels) ||
        !Array.isArray(snapshot.logos) ||
        snapshot.channels.length > 100_000 ||
        snapshot.logos.length > 150_000
    )
        throw new Error('Invalid logo catalog');
    if (
        !snapshot.channels.every(
            (c) =>
                c &&
                typeof c.id === 'string' &&
                c.id.length < 200 &&
                typeof c.name === 'string' &&
                c.name.length < 500 &&
                /^[A-Z]{2}$/.test(c.country) &&
                (!c.alt_names ||
                    (Array.isArray(c.alt_names) &&
                        c.alt_names.length < 100 &&
                        c.alt_names.every(
                            (n) => typeof n === 'string' && n.length < 500
                        )))
        )
    )
        throw new Error('Invalid channel catalog');
    // Invalid or unsupported logo entries are skipped without losing valid channels.
    snapshot.logos = snapshot.logos.filter(
        (l) =>
            l &&
            typeof l.channel === 'string' &&
            typeof l.url === 'string' &&
            l.url.length < 2000 &&
            /^https?:\/\//.test(l.url) &&
            l.in_use === true &&
            !l.feed &&
            ['PNG', 'JPEG'].includes(l.format) &&
            l.width > 0 &&
            l.height > 0 &&
            l.width <= 4096 &&
            l.height <= 4096
    );
    return snapshot;
}

export class ChannelLogoCatalog {
    private index: LogoCatalogIndex | null = null;
    private updated = 0;
    private retryAt = 0;
    constructor(private readonly root: string) {}

    async get(signal: AbortSignal): Promise<LogoCatalogIndex> {
        if (
            this.index &&
            Date.now() < Math.max(this.updated + 7 * LOGO_DAY, this.retryAt)
        )
            return this.index;
        const file = join(this.root, 'catalog.json');
        let snapshot: CatalogSnapshot | null = null;
        try {
            const bytes = await readFile(file);
            if (bytes.length <= 25_000_000)
                snapshot = parseLogoCatalog(JSON.parse(bytes.toString('utf8')));
        } catch {
            /* Missing/corrupt cache is refreshed through the validated transport. */
        }
        if (!snapshot || Date.now() - snapshot.updated >= 7 * LOGO_DAY) {
            try {
                const base =
                    logoFixtureRoot() ?? 'https://iptv-org.github.io/api';
                const channels = JSON.parse(
                    (
                        await fetchLogoResource(
                            `${base}/channels.json`,
                            signal,
                            15_000_000
                        )
                    ).toString('utf8')
                );
                const logos = JSON.parse(
                    (
                        await fetchLogoResource(
                            `${base}/logos.json`,
                            signal,
                            15_000_000
                        )
                    ).toString('utf8')
                );
                snapshot = parseLogoCatalog({
                    updated: Date.now(),
                    channels,
                    logos,
                });
                await mkdir(this.root, { recursive: true });
                const temp = `${file}.${randomUUID()}.tmp`;
                await writeFile(temp, JSON.stringify(snapshot), {
                    mode: 0o600,
                });
                await rename(temp, file);
            } catch {
                if (signal.aborted || !snapshot)
                    throw new Error('Logo catalog unavailable');
                // Use a valid prior snapshot offline, without retrying on every job.
                this.retryAt = Date.now() + LOGO_DAY;
            }
        }
        const images = new Map<string, LogoCatalogImage[]>();
        for (const logo of snapshot.logos) {
            const values = images.get(logo.channel) ?? [];
            values.push(logo);
            images.set(logo.channel, values);
        }
        const index = new LogoCatalogIndex();
        for (let i = 0; i < snapshot.channels.length; i++) {
            const channel = snapshot.channels[i];
            if (channel.closed) continue;
            const logo = images
                .get(channel.id)
                ?.sort(
                    (a, b) =>
                        (a.format === 'PNG' ? 0 : 1) -
                            (b.format === 'PNG' ? 0 : 1) ||
                        a.url.localeCompare(b.url)
                )[0];
            // Keep identities without a supported logo in the ambiguity index.
            const candidate: LogoCandidate = {
                id: channel.id,
                country: channel.country,
                names: [channel.name, ...(channel.alt_names ?? [])],
                url: logo?.url ?? '',
            };
            index.add(candidate);
            if (i % 300 === 0) {
                await yieldToMain();
                if (signal.aborted) throw new Error('Cancelled');
            }
        }
        this.index = index;
        this.updated = snapshot.updated;
        return index;
    }
}

import { createHash, randomUUID } from 'node:crypto';
import {
    mkdir,
    readFile,
    readdir,
    rename,
    stat,
    unlink,
    writeFile,
    utimes,
} from 'node:fs/promises';
import { join } from 'node:path';
import { nativeImage } from 'electron';
import { fetchLogoResource } from './channel-logo-catalog';

/** Inspect raster headers before invoking the native decoder. SVG is deliberately excluded. */
export function boundedLogoDimensions(bytes: Buffer): boolean {
    let width = 0;
    let height = 0;
    if (
        bytes.length >= 24 &&
        bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.toString('ascii', 12, 16) === 'IHDR'
    ) {
        width = bytes.readUInt32BE(16);
        height = bytes.readUInt32BE(20);
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        let offset = 2;
        while (offset + 8 < bytes.length) {
            if (bytes[offset] !== 0xff) return false;
            const marker = bytes[offset + 1];
            const size = bytes.readUInt16BE(offset + 2);
            if (size < 2 || offset + 2 + size > bytes.length) return false;
            if ([0xc0, 0xc1, 0xc2].includes(marker)) {
                height = bytes.readUInt16BE(offset + 5);
                width = bytes.readUInt16BE(offset + 7);
                break;
            }
            offset += size + 2;
        }
    }
    return (
        width > 0 &&
        height > 0 &&
        width <= 4096 &&
        height <= 4096 &&
        width * height <= 4_000_000
    );
}

export class ChannelLogoImages {
    private readonly checked = new Map<string, { hash: string; at: number }>();
    private lastPrune = 0;
    private inventory: Map<string, { size: number; time: number }> | null =
        null;
    private cacheBytes = 0;
    constructor(private readonly root: string) {}

    async download(url: string, signal: AbortSignal): Promise<string> {
        if (this.overBudget()) await this.prune();
        const cached = this.checked.get(url);
        if (cached && Date.now() - cached.at < 30 * 86_400_000) {
            try {
                await this.read(cached.hash);
                return cached.hash;
            } catch {
                this.checked.delete(url);
            }
        }
        const bytes = await fetchLogoResource(url, signal, 1_000_000);
        if (!boundedLogoDimensions(bytes))
            throw new Error('Unsupported logo dimensions or type');
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error('Invalid logo image');
        const size = image.getSize();
        const png = image
            .resize(
                size.width >= size.height
                    ? { width: Math.min(256, size.width) }
                    : { height: Math.min(256, size.height) }
            )
            .toPNG();
        if (!png.length || png.length > 131_072)
            throw new Error('Logo thumbnail exceeds limit');
        const hash = createHash('sha256').update(png).digest('hex');
        await mkdir(this.root, { recursive: true });
        const file = join(this.root, `${hash}.png`);
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, png, { mode: 0o600 });
            if (signal.aborted) throw new Error('Cancelled');
            await rename(temporary, file);
        } finally {
            await unlink(temporary).catch(() => undefined);
        }
        if (this.inventory) {
            this.cacheBytes +=
                png.length - (this.inventory.get(file)?.size ?? 0);
            this.inventory.set(file, { size: png.length, time: Date.now() });
        }
        this.checked.set(url, { hash, at: Date.now() });
        if (this.checked.size > 500)
            this.checked.delete(this.checked.keys().next().value!);
        await this.prune();
        return hash;
    }

    async read(hash: string): Promise<Buffer> {
        if (!/^[a-f0-9]{64}$/.test(hash))
            throw new Error('Invalid logo cache key');
        const file = join(this.root, `${hash}.png`);
        const info = await stat(file);
        if (info.size > 131_072) throw new Error('Invalid cached logo');
        const bytes = await readFile(file);
        if (createHash('sha256').update(bytes).digest('hex') !== hash)
            throw new Error('Invalid cached logo');
        const entry = this.inventory?.get(file);
        if (entry) entry.time = Date.now();
        // A recently used logo survives eviction; avoid writes on every lookup.
        if (Date.now() - info.mtimeMs > 86_400_000)
            await utimes(file, new Date(), new Date());
        return bytes;
    }

    private overBudget(): boolean {
        return (
            (this.inventory?.size ?? 0) > 1000 || this.cacheBytes > 128_000_000
        );
    }

    private async prune(): Promise<void> {
        // Inventory I/O is hourly; managed writes update the budget immediately.
        if (!this.inventory || Date.now() - this.lastPrune >= 3_600_000) {
            this.lastPrune = Date.now();
            this.inventory = new Map();
            this.cacheBytes = 0;
            for (const name of await readdir(this.root)) {
                if (!/^[a-f0-9]{64}\.png$/.test(name)) continue;
                const path = join(this.root, name);
                const info = await stat(path).catch(() => null);
                if (info) {
                    this.inventory.set(path, {
                        size: info.size,
                        time: info.mtimeMs,
                    });
                    this.cacheBytes += info.size;
                }
            }
        }
        if (!this.overBudget()) return;
        const oldest = [...this.inventory].sort(
            (a, b) => a[1].time - b[1].time
        );
        for (const [path, info] of oldest) {
            if (!this.overBudget()) break;
            await unlink(path).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== 'ENOENT') throw error;
            });
            this.inventory.delete(path);
            this.cacheBytes -= info.size;
        }
    }
}

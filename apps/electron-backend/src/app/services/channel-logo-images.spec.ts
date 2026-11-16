jest.mock('electron', () => ({ nativeImage: { createFromBuffer: jest.fn() } }));
jest.mock('./channel-logo-catalog', () => ({ fetchLogoResource: jest.fn() }));
import { nativeImage } from 'electron';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchLogoResource } from './channel-logo-catalog';
import {
    boundedLogoDimensions,
    ChannelLogoImages,
} from './channel-logo-images';

describe('logo image preflight', () => {
    function png(width: number, height: number): Buffer {
        const bytes = Buffer.alloc(24);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
        bytes.write('IHDR', 12);
        bytes.writeUInt32BE(width, 16);
        bytes.writeUInt32BE(height, 20);
        return bytes;
    }
    it('accepts bounded PNG headers for subsequent decoder validation', () =>
        expect(boundedLogoDimensions(png(512, 256))).toBe(true));
    it.each([
        [0, 1],
        [10_000, 10],
        [4096, 4096],
    ])('rejects excessive/empty dimensions %s x %s', (w, h) =>
        expect(boundedLogoDimensions(png(w, h))).toBe(false)
    );
    it('rejects SVG, HTML and truncated data before native decoding', () => {
        expect(boundedLogoDimensions(Buffer.from('<svg/>'))).toBe(false);
        expect(boundedLogoDimensions(Buffer.from('<html/>'))).toBe(false);
        expect(boundedLogoDimensions(Buffer.from([0xff, 0xd8, 0xff]))).toBe(
            false
        );
    });
    it('enforces the file budget on consecutive downloads within an hour', async () => {
        const root = await mkdtemp(join(tmpdir(), 'iptvnator-logo-budget-'));
        let sequence = 0;
        jest.mocked(fetchLogoResource).mockResolvedValue(png(16, 16));
        jest.mocked(nativeImage.createFromBuffer).mockImplementation(
            () =>
                ({
                    isEmpty: () => false,
                    getSize: () => ({ width: 16, height: 16 }),
                    resize: () => ({
                        toPNG: () =>
                            Buffer.from(`synthetic-thumbnail-${sequence++}`),
                    }),
                }) as unknown as Electron.NativeImage
        );
        try {
            for (let i = 0; i < 1000; i++)
                await writeFile(
                    join(root, `${i.toString(16).padStart(64, '0')}.png`),
                    'fixture'
                );
            const cache = new ChannelLogoImages(root);
            await cache.download(
                'https://example.com/first.png',
                new AbortController().signal
            );
            expect(
                (await readdir(root)).filter((name) => name.endsWith('.png'))
            ).toHaveLength(1000);
            await cache.download(
                'https://example.com/second.png',
                new AbortController().signal
            );
            expect(
                (await readdir(root)).filter((name) => name.endsWith('.png'))
            ).toHaveLength(1000);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);
});

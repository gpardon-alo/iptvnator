import { parseLogoCatalog, ChannelLogoCatalog } from './channel-logo-catalog';
import { requestWithValidatedRedirects } from '../util/validated-axios';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
jest.mock('../util/validated-axios', () => ({
    requestWithValidatedRedirects: jest.fn(),
}));

const channel = {
    id: 'Example.us',
    name: 'Example News',
    country: 'US',
    alt_names: [],
};
const image = {
    channel: 'Example.us',
    url: 'https://example.com/logo.png',
    feed: null,
    in_use: true,
    format: 'PNG',
    width: 100,
    height: 50,
};
describe('bounded public logo catalog', () => {
    it('skips unsupported, retired and regional artwork without dropping identity ambiguity', () => {
        const snapshot = parseLogoCatalog({
            updated: 1,
            channels: [channel],
            logos: [
                image,
                { ...image, format: 'SVG' },
                { ...image, in_use: false },
                { ...image, feed: 'West' },
            ],
        });
        expect(snapshot.logos).toEqual([image]);
    });
    it('rejects malformed input instead of trusting downloaded metadata', () => {
        expect(() =>
            parseLogoCatalog({
                updated: 1,
                channels: [{ id: 'bad' }],
                logos: [],
            })
        ).toThrow();
        expect(() => parseLogoCatalog(null)).toThrow();
    });
    it('downloads once, persists and reuses a valid snapshot offline after restart', async () => {
        const root = await mkdtemp(join(tmpdir(), 'iptvnator-catalog-'));
        const request = jest.mocked(requestWithValidatedRedirects);
        request.mockImplementation(
            async (url) =>
                ({
                    data: Buffer.from(
                        JSON.stringify(
                            url.endsWith('channels.json') ? [channel] : [image]
                        )
                    ),
                }) as never
        );
        try {
            const first = await new ChannelLogoCatalog(root).get(
                new AbortController().signal
            );
            expect(first.match('US | Example News', '')?.id).toBe('Example.us');
            expect(request).toHaveBeenCalledTimes(2);
            request.mockRejectedValue(new Error('Synthetic offline'));
            const second = await new ChannelLogoCatalog(root).get(
                new AbortController().signal
            );
            expect(second.match('', 'Example.us')?.url).toBe(image.url);
            expect(request).toHaveBeenCalledTimes(2);
            expect(request.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    timeout: 15_000,
                    maxContentLength: 15_000_000,
                })
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

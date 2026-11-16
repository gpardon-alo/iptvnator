jest.mock('electron', () => ({ nativeImage: { createFromBuffer: jest.fn() } }));
import { boundedLogoDimensions } from './channel-logo-images';

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
});

import { HttpEventType, provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DiscoveryDictionaryDownload } from './discovery-dictionary-download.service';

describe('Dictionary URL download', () => {
    const url = 'https://dictionary.example.test/mappings.json';
    let downloader: DiscoveryDictionaryDownload;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        downloader = TestBed.inject(DiscoveryDictionaryDownload);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => {
        http.verify();
        jest.useRealTimers();
    });

    it('downloads a direct URL without cross-origin credentials', async () => {
        const result = downloader.download(` ${url} `);
        const request = http.expectOne(url);
        expect(request.request.withCredentials).toBe(false);
        expect(request.request.responseType).toBe('blob');
        const body = new Blob(['[]'], { type: 'application/json' });
        request.flush(body);
        expect(await result).toBe(body);
    });

    it.each([
        '',
        '/relative.json',
        'file:///tmp/dictionary.json',
        'javascript:alert(1)',
        'https://user:secret@dictionary.example.test/file',
    ])('rejects unsupported URLs without a request: %s', async (value) => {
        await expect(downloader.download(value)).rejects.toThrow(
            'Enter a full HTTP or HTTPS URL'
        );
        http.expectNone(() => true);
    });

    it.each([
        { loaded: 32 * 1024 * 1024 + 1 },
        { loaded: 1, total: 32 * 1024 * 1024 + 1 },
    ])('aborts an oversized response during download', async (progress) => {
        const result = expect(downloader.download(url)).rejects.toThrow(
            '32 MiB'
        );
        const request = http.expectOne(url);
        request.event({ type: HttpEventType.DownloadProgress, ...progress });
        await result;
        expect(request.cancelled).toBe(true);
    });

    it('checks the final size when progress is unavailable', async () => {
        const result = expect(downloader.download(url)).rejects.toThrow(
            '32 MiB'
        );
        http.expectOne(url).flush(
            new Blob([new Uint8Array(32 * 1024 * 1024 + 1)])
        );
        await result;
    });

    it('redacts failed URLs and allows a later retry', async () => {
        const failed = expect(
            downloader.download(`${url}?token=private-example`)
        ).rejects.toThrow('Check the URL');
        http.expectOne(`${url}?token=private-example`).flush(
            new Blob(['private-example']),
            { status: 503, statusText: 'Unavailable' }
        );
        await failed;
        const retry = downloader.download(url);
        http.expectOne(url).flush(new Blob(['[]']));
        await expect(retry).resolves.toBeInstanceOf(Blob);
    });

    it('times out a stalled request', async () => {
        jest.useFakeTimers();
        const failed = expect(downloader.download(url)).rejects.toThrow(
            'Could not download'
        );
        const request = http.expectOne(url);
        jest.advanceTimersByTime(30_000);
        await failed;
        expect(request.cancelled).toBe(true);
    });
});

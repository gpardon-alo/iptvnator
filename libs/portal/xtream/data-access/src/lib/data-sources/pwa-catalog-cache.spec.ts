import { TestBed } from '@angular/core/testing';
import { SourceCatalogUpdatesService } from '@iptvnator/services';
import { PwaCatalogCache, PWA_CATALOG_TTL } from './pwa-catalog-cache';
import { catalogStorage } from './pwa-catalog-storage';

jest.mock('./pwa-catalog-storage');

describe('persistent PWA catalog cache', () => {
    const credentials = {
        serverUrl: 'https://provider.example',
        username: 'demo',
        password: 'synthetic',
    };
    const saved = new Map<string, unknown>();
    let now: number;
    let storage: { read: jest.Mock; write: jest.Mock; remove: jest.Mock };
    beforeEach(() => {
        now = 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        saved.clear();
        storage = {
            read: jest.fn(async (key) => saved.get(key)),
            write: jest.fn(async (key, value, current) => {
                if (current())
                    saved.set(key, JSON.parse(JSON.stringify(value)));
            }),
            remove: jest.fn(async (id) => {
                for (const key of saved.keys())
                    if (key.startsWith(`${id}:`)) saved.delete(key);
            }),
        };
        jest.mocked(catalogStorage).mockReturnValue(storage);
    });
    afterEach(() => jest.restoreAllMocks());

    it('publishes fresh live catalogs after manual invalidation and automatic TTL expiry, not cache hits', async () => {
        const changed = jest.fn();
        TestBed.inject(SourceCatalogUpdatesService).liveUpdated$.subscribe(
            changed
        );
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        const fetch = jest.fn().mockResolvedValue([]);
        await cache.load('source', 'live-content', credentials, fetch);
        expect(changed).toHaveBeenCalledTimes(1);
        await cache.load('source', 'live-content', credentials, fetch);
        await cache.load('source', 'movie-content', credentials, fetch);
        expect(changed).toHaveBeenCalledTimes(1);
        await cache.clear('source');
        expect(changed).toHaveBeenCalledTimes(1);
        await cache.load('source', 'live-content', credentials, fetch);
        now += PWA_CATALOG_TTL;
        await cache.load('source', 'live-content', credentials, fetch);
        expect(changed.mock.calls).toEqual([
            ['source'],
            ['source'],
            ['source'],
        ]);
    });

    it('does not publish failed or cancelled live fetches', async () => {
        const changed = jest.fn();
        TestBed.inject(SourceCatalogUpdatesService).liveUpdated$.subscribe(
            changed
        );
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        await expect(
            cache.load('source', 'live-content', credentials, async () => {
                throw new Error('offline');
            })
        ).rejects.toThrow('offline');
        const controller = new AbortController();
        storage.write.mockImplementationOnce(async () => controller.abort());
        await expect(
            cache.load(
                'source',
                'live-content',
                credentials,
                async () => [],
                controller.signal
            )
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(changed).not.toHaveBeenCalled();
    });

    it('reuses categories and content after reload, including successful empty lists, until exactly 24 hours', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue([
                { category_id: '1', category_name: 'Synthetic' },
            ]);
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        await cache.load('source', 'live-categories', credentials, fetch);
        await cache.load('source', 'live-content', credentials, async () => []);
        now += PWA_CATALOG_TTL - 1;
        const reload = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        await reload.load('source', 'live-categories', credentials, fetch);
        await expect(
            reload.load('source', 'live-content', credentials, () => {
                throw new Error('Unexpected provider call');
            })
        ).resolves.toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(1);
        now++;
        await reload.load('source', 'live-categories', credentials, fetch);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('isolates sources, types and edited connections without persisting credentials', async () => {
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        const fetch = jest.fn().mockResolvedValue([]);
        await cache.load('source', 'live-content', credentials, fetch);
        await cache.load('other', 'live-content', credentials, fetch);
        await cache.load('source', 'movie-content', credentials, fetch);
        await cache.load(
            'source',
            'live-content',
            { ...credentials, password: 'changed' },
            fetch
        );
        expect(fetch).toHaveBeenCalledTimes(4);
        expect(JSON.stringify([...saved])).not.toContain(credentials.password);
        expect(JSON.stringify([...saved])).not.toContain(credentials.serverUrl);
    });

    it('validates session enrichments against the fetched entry after an aborted persistence wait', async () => {
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        const old = [{ name: 'old' }];
        await cache.load(
            'source',
            'live-content',
            credentials,
            async () => old
        );
        now += PWA_CATALOG_TTL;
        const controller = new AbortController();
        storage.write.mockImplementationOnce(async () => {
            controller.abort();
        });
        await expect(
            cache.load(
                'source',
                'live-content',
                credentials,
                async () => [{ name: 'new' }],
                controller.signal
            )
        ).rejects.toMatchObject({ name: 'AbortError' });
        const currentRows = jest.fn((validatedRows) =>
            validatedRows === old ? old : undefined
        );
        const rows = await cache.load(
            'source',
            'live-content',
            credentials,
            async () => [],
            undefined,
            currentRows
        );
        expect(currentRows).toHaveBeenCalledWith([{ name: 'new' }]);
        expect(rows).toEqual([{ name: 'new' }]);
    });

    it('forces refresh only for the selected source', async () => {
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        const fetch = jest.fn().mockResolvedValue([]);
        await cache.load('source', 'live-content', credentials, fetch);
        await cache.load('source-extra', 'live-content', credentials, fetch);
        await cache.clear('source');
        const reload = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        await reload.load('source-extra', 'live-content', credentials, fetch);
        await reload.load('source', 'live-content', credentials, fetch);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('keeps API reads usable when IndexedDB is denied or full, and never caches failures', async () => {
        storage.read.mockRejectedValue(new Error('denied'));
        storage.write.mockRejectedValue(new Error('quota'));
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('provider'))
            .mockResolvedValue([]);
        await expect(
            cache.load('source', 'series-content', credentials, fetch)
        ).rejects.toThrow('provider');
        await cache.load('source', 'series-content', credentials, fetch);
        await cache.load('source', 'series-content', credentials, fetch);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not let an old request repopulate the cache after explicit refresh', async () => {
        const changed = jest.fn();
        TestBed.inject(SourceCatalogUpdatesService).liveUpdated$.subscribe(
            changed
        );
        const cache = TestBed.runInInjectionContext(
            () => new PwaCatalogCache()
        );
        let finish!: (rows: unknown[]) => void;
        let started!: () => void;
        const ready = new Promise<void>((resolve) => {
            started = resolve;
        });
        const request = cache.load(
            'source',
            'live-content',
            credentials,
            () => {
                started();
                return new Promise<unknown[]>((resolve) => {
                    finish = resolve;
                });
            }
        );
        await ready;
        await cache.clear('source');
        finish([]);
        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
        expect(saved.size).toBe(0);
        expect(changed).not.toHaveBeenCalled();
    });
});

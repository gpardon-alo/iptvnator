import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { EpgRuntimeBridgeService } from '@iptvnator/epg/data-access';
import {
    EpgPreferencesService,
    EpgSourceSettingsService,
    PlaylistsService,
    SettingsStore,
    SourceCatalogUpdatesService,
} from '@iptvnator/services';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import { DiscoveryDictionaryUrlStorage } from '@iptvnator/portal/shared/data-access';
import { SourceRefreshFollowUpService } from './source-refresh-follow-up.service';

describe('source → dictionary → XMLTV refresh', () => {
    const url = 'https://guide.example.test/guide.xml';
    const flush = async () => {
        for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    let sources: { _id: string; serverUrl?: string; epgUrls?: string[] }[];
    let order: string[];
    let dictionary: { refresh: jest.Mock };
    let urls: { read: jest.Mock };
    let preferences: { enabled: jest.Mock };
    let bridge: { supportsDataManagement: boolean; forceFetchEpg: jest.Mock };
    let epgSources: {
        waitForReconciliation: jest.Mock;
        invalidateLookups: jest.Mock;
    };
    let snackBar: { open: jest.Mock };
    let service: SourceRefreshFollowUpService;
    let guideUrls: string[];

    beforeEach(async () => {
        const { DiscoveryDictionaryRefreshService } =
            await import('@iptvnator/workspace/discovery/feature');
        sources = [
            { _id: 'synthetic', serverUrl: 'https://provider.example.test' },
        ];
        guideUrls = [url, url];
        order = [];
        dictionary = {
            refresh: jest.fn(async () => {
                order.push('dictionary');
            }),
        };
        urls = {
            read: jest.fn(
                () => 'https://dictionary.example.test/channels.json'
            ),
        };
        preferences = { enabled: jest.fn(() => true) };
        bridge = {
            supportsDataManagement: true,
            forceFetchEpg: jest.fn(async () => {
                order.push('epg');
                return { success: true };
            }),
        };
        epgSources = {
            waitForReconciliation: jest.fn().mockResolvedValue(undefined),
            invalidateLookups: jest.fn(() => {
                order.push('invalidate');
            }),
        };
        snackBar = { open: jest.fn() };
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: PlaylistsService,
                    useValue: { getAllPlaylists: () => of(sources) },
                },
                {
                    provide: SettingsStore,
                    useValue: {
                        loadSettings: jest.fn().mockResolvedValue(undefined),
                        epgUrl: () => guideUrls,
                        getTrustOptions: () => ({}),
                    },
                },
                { provide: EpgPreferencesService, useValue: preferences },
                { provide: EpgSourceSettingsService, useValue: epgSources },
                { provide: EpgRuntimeBridgeService, useValue: bridge },
                { provide: DiscoveryDictionaryUrlStorage, useValue: urls },
                {
                    provide: DiscoveryDictionaryRefreshService,
                    useValue: dictionary,
                },
                { provide: LazySnackBar, useValue: snackBar },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
            ],
        });
        service = TestBed.inject(SourceRefreshFollowUpService);
    });

    it('waits for the dictionary before force-downloading the guide and invalidating lookups', async () => {
        await service.refresh('synthetic', () => true);
        expect(order).toEqual(['dictionary', 'epg', 'invalidate']);
        expect(bridge.forceFetchEpg).toHaveBeenCalledWith(url, {});
        expect(snackBar.open).not.toHaveBeenCalled();
    });

    it('reuses saved mappings without a dictionary URL and still refreshes EPG', async () => {
        urls.read.mockReturnValue('');
        await service.refresh('synthetic', () => true);
        expect(dictionary.refresh).not.toHaveBeenCalled();
        expect(order).toEqual(['epg', 'invalidate']);
    });
    it('drops scoped guide snapshots changed while reconciliation is pending', async () => {
        urls.read.mockReturnValue('');
        sources = [
            {
                _id: 'synthetic',
                epgUrls: ['https://scoped.example.test/guide.xml'],
            },
        ];
        epgSources.waitForReconciliation.mockImplementation(async () => {
            sources = [{ _id: 'synthetic', epgUrls: [] }];
        });
        await service.refresh('synthetic', () => true);
        expect(bridge.forceFetchEpg).not.toHaveBeenCalled();
    });

    it.each([1, 2])(
        'retires a changed global configuration with %i queued guides without an error toast',
        async (count) => {
            guideUrls = [url, 'https://other.example.test/guide.xml'].slice(
                0,
                count
            );
            bridge.forceFetchEpg.mockImplementation(async () => {
                guideUrls = [];
                return null;
            });
            await service.refresh('synthetic', () => true);
            expect(bridge.forceFetchEpg.mock.calls).toEqual([[url, {}]]);
            expect(snackBar.open).not.toHaveBeenCalled();
        }
    );

    it.each([1, 2])(
        'retires %i queued guides when EPG is disabled during a download',
        async (count) => {
            guideUrls = [url, 'https://other.example.test/guide.xml'].slice(
                0,
                count
            );
            bridge.forceFetchEpg.mockImplementation(async () => {
                preferences.enabled.mockReturnValue(false);
                return null;
            });
            await service.refresh('synthetic', () => true);
            expect(bridge.forceFetchEpg).toHaveBeenCalledTimes(1);
            expect(snackBar.open).not.toHaveBeenCalled();
        }
    );

    it('continues EPG after dictionary failure and reports only the failed step', async () => {
        dictionary.refresh.mockRejectedValue(
            new Error('https://private.example.test/token')
        );
        await service.refresh('synthetic', () => true);
        expect(bridge.forceFetchEpg).toHaveBeenCalledTimes(1);
        expect(snackBar.open).toHaveBeenCalledWith(
            'EPG.SOURCE_REFRESH_FAILED',
            'CLOSE',
            { duration: 7000 }
        );
        expect(JSON.stringify(snackBar.open.mock.calls)).not.toContain(
            'private.example'
        );
    });

    it('reports a rejected EPG import while leaving replacement to the transactional importer', async () => {
        bridge.forceFetchEpg.mockResolvedValue({ success: false });
        await service.refresh('synthetic', () => true);
        expect(snackBar.open).toHaveBeenCalledTimes(1);
        expect(epgSources.invalidateLookups).toHaveBeenCalledTimes(1);
    });

    it.each(['disabled', 'unsupported'])(
        'does not fetch XMLTV when %s',
        async (mode) => {
            if (mode === 'disabled') preferences.enabled.mockReturnValue(false);
            else bridge.supportsDataManagement = false;
            await service.refresh('synthetic', () => true);
            expect(dictionary.refresh).toHaveBeenCalledTimes(1);
            expect(bridge.forceFetchEpg).not.toHaveBeenCalled();
            expect(snackBar.open).not.toHaveBeenCalled();
        }
    );

    it('does not continue after the source is deleted during dictionary download', async () => {
        dictionary.refresh.mockImplementation(async () => {
            sources = [];
        });
        await service.refresh('synthetic', () => true);
        expect(bridge.forceFetchEpg).not.toHaveBeenCalled();
        expect(epgSources.invalidateLookups).not.toHaveBeenCalled();
    });

    it('does not publish after the owning profile or app is retired', async () => {
        let active = true;
        dictionary.refresh.mockImplementation(async () => {
            active = false;
        });
        await service.refresh('synthetic', () => active);
        expect(bridge.forceFetchEpg).not.toHaveBeenCalled();
        expect(snackBar.open).not.toHaveBeenCalled();
    });

    it('shares a backup-guide download across concurrent source refreshes', async () => {
        urls.read.mockReturnValue('');
        sources.push({ _id: 'other', serverUrl: 'https://other.example.test' });
        let finish!: (value: { success: boolean }) => void;
        bridge.forceFetchEpg.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const first = service.refresh('synthetic', () => true);
        const second = service.refresh('other', () => true);
        await flush();
        expect(bridge.forceFetchEpg).toHaveBeenCalledTimes(1);
        finish({ success: true });
        await Promise.all([first, second]);
    });

    it('refreshes a saved M3U source without dictionary work and deduplicates global/scoped URLs', async () => {
        sources = [{ _id: 'synthetic', epgUrls: [url] }];
        await service.refresh('synthetic', () => true);
        expect(dictionary.refresh).not.toHaveBeenCalled();
        expect(bridge.forceFetchEpg).toHaveBeenCalledTimes(1);
    });

    it('runs through the shared successful-catalog notification even when Dictionary is closed', async () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        updates.afterRefresh((id) => service.refresh(id, () => true));
        updates.liveUpdated$.subscribe(() => order.push('catalog-ready'));
        updates.liveUpdated('synthetic');
        await flush();
        expect(order).toEqual([
            'dictionary',
            'epg',
            'invalidate',
            'catalog-ready',
        ]);
    });
});

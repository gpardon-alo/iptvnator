import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
    EpgLookupUnavailableError,
    StreamResolverService,
} from '@iptvnator/portal/shared/data-access';
import { classifyDiscoveryStream } from '@iptvnator/portal/shared/util';
import {
    ChannelIssuesService,
    EpgPreferencesService,
    EpgSourceSettingsService,
    RuntimeCapabilitiesService,
    SettingsStore,
} from '@iptvnator/services';
import { EpgItem } from '@iptvnator/shared/interfaces';
import { DiscoveryGuideSession } from './discovery-guide-session';

const row = classifyDiscoveryStream(
    { source_id: 'synthetic', stream_id: 42, name: 'Synthetic alternate' },
    []
);
const program: EpgItem = {
    id: '1',
    epg_id: '1',
    title: 'Synthetic programme',
    lang: 'en',
    start: '2026-11-08T10:00:00Z',
    end: '2026-11-08T11:00:00Z',
    stop: '2026-11-08T11:00:00Z',
    description: 'Synthetic guide',
    channel_id: '42',
    start_timestamp: '1794132000',
    stop_timestamp: '1794135600',
};

describe('Discovery selected-channel guide', () => {
    let resolver: { loadEpgItems: jest.Mock };
    let session: DiscoveryGuideSession;
    let preferences: EpgPreferencesService;
    let runtime: { supportsProviderEpg: boolean };
    beforeEach(() => {
        localStorage.clear();
        runtime = { supportsProviderEpg: true };
        resolver = { loadEpgItems: jest.fn().mockResolvedValue([program]) };
        TestBed.configureTestingModule({
            providers: [
                DiscoveryGuideSession,
                { provide: RuntimeCapabilitiesService, useValue: runtime },
                { provide: StreamResolverService, useValue: resolver },
                {
                    provide: SettingsStore,
                    useValue: { resolvedEpgOffsetMinutes: signal(60) },
                },
            ],
        });
        session = TestBed.inject(DiscoveryGuideSession);
        preferences = TestBed.inject(EpgPreferencesService);
    });
    it('resolves the selected provider identity and retains timestamp and display-offset handling', async () => {
        await session.load(row, 'synthetic.xmltv.channel');
        expect(resolver.loadEpgItems).toHaveBeenCalledWith(
            expect.objectContaining({
                playlistId: 'synthetic',
                xtreamId: 42,
                contentType: 'live',
                epgChannelId: 'synthetic.xmltv.channel',
            }),
            { throwOnFailure: true }
        );
        expect(session.programs()[0]).toMatchObject({
            title: program.title,
            startTimestamp: 1794132000,
            stopTimestamp: 1794135600,
        });
        expect(session.offsetMinutes()).toBe(60);
        expect(session.loading()).toBe(false);
    });
    it('does not record a missing guide when provider EPG is unavailable', async () => {
        runtime.supportsProviderEpg = false;
        resolver.loadEpgItems.mockResolvedValue([]);
        await session.load(row);
        expect(resolver.loadEpgItems).not.toHaveBeenCalled();
        expect(TestBed.inject(ChannelIssuesService).issues()).toEqual([]);
        expect(session.loading()).toBe(false);
    });
    it('does not load EPG for demo channels or when EPG is disabled', async () => {
        await session.load(null);
        await preferences.apply(false);
        await session.load(row);
        expect(resolver.loadEpgItems).not.toHaveBeenCalled();
        expect(session.programs()).toEqual([]);
    });
    it('ignores late guide data when switching alternates and closing', async () => {
        let resolve!: (items: EpgItem[]) => void;
        resolver.loadEpgItems.mockImplementationOnce(
            () =>
                new Promise((r) => {
                    resolve = r;
                })
        );
        const pending = session.load(row);
        await Promise.resolve();
        await Promise.resolve();
        await session.load({
            ...row,
            provider: { ...row.provider, stream_id: 43 },
        });
        resolve([{ ...program, title: 'Stale programme' }]);
        await pending;
        expect(session.programs()[0].title).toBe('Synthetic programme');
        const closing = session.load(row);
        session.close();
        await closing;
        expect(session.programs()).toEqual([]);
    });
    it.each([false, true])(
        'does not report cancelled off/on preference revisions (%s)',
        async (fails) => {
            let finish!: () => void;
            let markStarted!: () => void;
            const started = new Promise<void>((resolve) => {
                markStarted = resolve;
            });
            resolver.loadEpgItems.mockImplementationOnce(
                () =>
                    new Promise((resolve, reject) => {
                        finish = () =>
                            fails
                                ? reject(new Error('Retired synthetic request'))
                                : resolve([]);
                        markStarted();
                    })
            );
            const pending = session.load(row);
            await started;
            await preferences.apply(false);
            await preferences.apply(true);
            finish();
            await pending;
            expect(TestBed.inject(ChannelIssuesService).issues()).toEqual([]);
            expect(session.failed()).toBe(false);
            expect(session.loading()).toBe(false);
            await session.load(row);
            expect(session.programs()).toHaveLength(1);
        }
    );
    it('retires loaded programmes and pending observations after dictionary/source revisions', async () => {
        await session.load(row);
        TestBed.inject(EpgSourceSettingsService).invalidateLookups();
        expect(session.programs()).toEqual([]);
        let finish!: (items: EpgItem[]) => void;
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        resolver.loadEpgItems.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                    markStarted();
                })
        );
        const pending = session.load(row);
        await started;
        TestBed.inject(EpgSourceSettingsService).invalidateLookups();
        finish([]);
        await pending;
        expect(TestBed.inject(ChannelIssuesService).issues()).toEqual([]);
        expect(session.loading()).toBe(false);
    });
    it('clears stale programmes and exposes retryable failures', async () => {
        await session.load(row);
        resolver.loadEpgItems.mockRejectedValueOnce(
            new Error('Synthetic failure')
        );
        await session.load(row);
        expect(session.failed()).toBe(true);
        expect(session.programs()).toEqual([]);
        await session.load(row);
        expect(session.failed()).toBe(false);
        expect(session.programs()).toHaveLength(1);
    });
    it('does not record an issue when the selected source is unavailable', async () => {
        resolver.loadEpgItems.mockRejectedValueOnce(
            new EpgLookupUnavailableError()
        );
        await session.load(row);
        expect(TestBed.inject(ChannelIssuesService).issues()).toEqual([]);
        expect(session.failed()).toBe(false);
    });
    it('records completed empty/failed guide observations and clears them when data returns', async () => {
        const issues = TestBed.inject(ChannelIssuesService);
        resolver.loadEpgItems.mockResolvedValueOnce([]);
        await session.load(row, 'example.test');
        expect(issues.issues()[0]).toMatchObject({
            sourceId: 'synthetic',
            streamId: 42,
            reason: 'empty-epg',
        });
        resolver.loadEpgItems.mockRejectedValueOnce(
            new Error('synthetic outage')
        );
        await session.load(row);
        expect(issues.issues()[0].reason).toBe('epg-error');
        await session.load(row);
        expect(issues.issues()).toEqual([]);
        await preferences.apply(false);
        resolver.loadEpgItems.mockResolvedValueOnce([]);
        await session.load(row);
        expect(issues.issues()).toEqual([]);
    });
});

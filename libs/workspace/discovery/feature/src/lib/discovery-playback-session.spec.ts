import { signal } from '@angular/core';
import { ParentalLockService } from '@iptvnator/services';
import { TestBed } from '@angular/core/testing';
import { PlaybackHistoryGate } from '@iptvnator/playback/data-access';
import { UnifiedRecentDataService } from '@iptvnator/portal/shared/data-access';
import {
    classifyDiscoveryStream,
    PORTAL_PLAYER,
} from '@iptvnator/portal/shared/util';
import {
    XTREAM_DATA_SOURCE,
    XtreamUrlService,
    XtreamApiService,
} from '@iptvnator/portal/xtream/data-access';
import { SettingsStore } from '@iptvnator/services';
import { DiscoveryPlaybackSession } from './discovery-playback-session';

describe('Discovery playback session', () => {
    const source = {
        id: 'synthetic',
        name: 'Synthetic source',
        userAgent: 'TestAgent',
        referrer: 'https://example.test',
        origin: 'https://example.test',
    };
    const row = classifyDiscoveryStream(
        {
            source_id: source.id,
            stream_id: 42,
            name: 'Synthetic alternate',
        },
        []
    );
    const lockVersion = signal(0);
    let session: DiscoveryPlaybackSession;
    let data: { getPlaylist: jest.Mock };
    let player: {
        isEmbeddedPlayer: jest.Mock;
        openResolvedPlayback: jest.Mock;
        openExternalPlayback: jest.Mock;
    };
    let urls: {
        constructLiveUrl: jest.Mock;
        constructAutoLiveTsUrl: jest.Mock;
    };
    const getAccountInfo = jest.fn();
    let history: { defer: jest.Mock };
    let recent: { recordLivePlayback: jest.Mock };
    beforeEach(() => {
        lockVersion.set(0);
        getAccountInfo.mockReset().mockResolvedValue({ user_info: {} });
        data = { getPlaylist: jest.fn().mockResolvedValue(source) };
        player = {
            isEmbeddedPlayer: jest.fn().mockReturnValue(true),
            openResolvedPlayback: jest.fn().mockResolvedValue(undefined),
            openExternalPlayback: jest.fn(),
        };
        urls = {
            constructLiveUrl: jest
                .fn()
                .mockReturnValue('https://media.example.test/42.m3u8'),
            constructAutoLiveTsUrl: jest
                .fn()
                .mockReturnValue('https://media.example.test/42.ts'),
        };
        history = { defer: jest.fn() };
        recent = { recordLivePlayback: jest.fn().mockResolvedValue(undefined) };
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: ParentalLockService,
                    useValue: { version: lockVersion },
                },
                DiscoveryPlaybackSession,
                { provide: XTREAM_DATA_SOURCE, useValue: data },
                { provide: XtreamUrlService, useValue: urls },
                { provide: XtreamApiService, useValue: { getAccountInfo } },
                {
                    provide: SettingsStore,
                    useValue: {
                        loadSettings: jest.fn().mockResolvedValue(undefined),
                    },
                },
                { provide: PORTAL_PLAYER, useValue: player },
                { provide: PlaybackHistoryGate, useValue: history },
                { provide: UnifiedRecentDataService, useValue: recent },
            ],
        });
        session = TestBed.inject(DiscoveryPlaybackSession);
    });
    it('uses original provider identity and headers, and waits for confirmed playback before recording history', async () => {
        await session.play(
            { ...row, name: 'Edited grouping root' },
            'logo.svg'
        );
        expect(data.getPlaylist).toHaveBeenCalledWith('synthetic');
        expect(urls.constructLiveUrl).toHaveBeenCalledWith(source, 42);
        expect(session.playback()).toMatchObject({
            title: 'Synthetic alternate',
            isLive: true,
            userAgent: 'TestAgent',
            referer: source.referrer,
            origin: source.origin,
            liveAutoTsUrl: 'https://media.example.test/42.ts',
        });
        expect(player.openResolvedPlayback).not.toHaveBeenCalled();
        expect(recent.recordLivePlayback).not.toHaveBeenCalled();
        history.defer.mock.calls[0][1]();
        expect(recent.recordLivePlayback).toHaveBeenCalledWith(
            expect.objectContaining({
                xtreamId: 42,
                playlistId: source.id,
                contentType: 'live',
            })
        );
    });
    it('ignores a late resolution after another alternate is selected or the view is closed', async () => {
        let resolve!: (value: typeof source) => void;
        data.getPlaylist.mockImplementationOnce(
            () =>
                new Promise((r) => {
                    resolve = r;
                })
        );
        const pending = session.play(row, '');
        await Promise.resolve();
        await session.play(
            { ...row, provider: { ...row.provider, stream_id: 43 } },
            ''
        );
        const key = session.sessionKey();
        resolve(source);
        await pending;
        expect(session.sessionKey()).toBe(key);
        expect(urls.constructLiveUrl).toHaveBeenCalledTimes(1);
        const closing = session.play(row, '');
        session.close();
        await closing;
        expect(session.playback()).toBeNull();
        expect(session.loading()).toBe(false);
    });
    it('constructs a session when LAN HTTP does not provide randomUUID', () => {
        const original = Object.getOwnPropertyDescriptor(
            globalThis.crypto,
            'randomUUID'
        );
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
            configurable: true,
            value: undefined,
        });
        try {
            expect(() =>
                TestBed.runInInjectionContext(
                    () => new DiscoveryPlaybackSession()
                )
            ).not.toThrow();
        } finally {
            if (original)
                Object.defineProperty(
                    globalThis.crypto,
                    'randomUUID',
                    original
                );
            else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
        }
    });
    it('resolves TS-only account capabilities before building the live URL', async () => {
        getAccountInfo.mockResolvedValue({
            user_info: { allowed_output_formats: ['ts'] },
        });
        await session.play(row, '');
        expect(urls.constructLiveUrl).toHaveBeenCalledWith(
            { ...source, allowedOutputFormats: ['ts'] },
            42
        );
    });
    it('closes playback and rejects pending resolution when parental lock changes', async () => {
        TestBed.flushEffects();
        await session.play(row, '');
        expect(session.playback()).not.toBeNull();
        lockVersion.update((v) => v + 1);
        TestBed.flushEffects();
        expect(session.playback()).toBeNull();
    });
    it('honors external-player settings and confirms history by URL', async () => {
        player.isEmbeddedPlayer.mockReturnValue(false);
        await session.play(row, '');
        expect(player.openResolvedPlayback).toHaveBeenCalledWith(
            session.playback()
        );
        expect(history.defer.mock.calls[0][0].sessionKey).toBeNull();
        expect(session.inline()).toBe(false);
    });
    it('reports a redacted recoverable failure and leaves demo channels unconnected', async () => {
        data.getPlaylist.mockRejectedValue(
            new Error('private provider credentials')
        );
        await session.play(row, '');
        expect(session.error()).toContain('Unable to open');
        expect(session.error()).not.toContain('private');
        expect(history.defer).not.toHaveBeenCalled();
        await session.play(null, '');
        expect(session.playback()).toBeNull();
        expect(session.error()).toBe('');
    });
});

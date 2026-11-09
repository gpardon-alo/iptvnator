import { inject, Injectable, signal } from '@angular/core';
import { PlaybackHistoryGate } from '@iptvnator/playback/data-access';
import { UnifiedRecentDataService } from '@iptvnator/portal/shared/data-access';
import {
    buildXtreamCollectionUid,
    ClassifiedStream,
    PORTAL_PLAYER,
} from '@iptvnator/portal/shared/util';
import {
    XTREAM_DATA_SOURCE,
    XtreamUrlService,
} from '@iptvnator/portal/xtream/data-access';
import { SettingsStore } from '@iptvnator/services';
import { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import { PlaybackFallbackRequest } from '@iptvnator/ui/playback';

@Injectable()
export class DiscoveryPlaybackSession {
    private readonly data = inject(XTREAM_DATA_SOURCE);
    private readonly urls = inject(XtreamUrlService);
    private readonly settings = inject(SettingsStore);
    private readonly player = inject(PORTAL_PLAYER);
    private readonly history = inject(PlaybackHistoryGate);
    private readonly recent = inject(UnifiedRecentDataService);
    readonly playback = signal<ResolvedPortalPlayback | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    readonly inline = signal(true);
    readonly sessionKey = signal('');
    private generation = 0;
    private readonly instanceId = crypto.randomUUID();

    close(): void {
        this.generation++;
        this.playback.set(null);
        this.loading.set(false);
        this.error.set('');
    }

    async play(row: ClassifiedStream | null, logo: string): Promise<void> {
        this.close();
        if (!row) return;
        const generation = this.generation;
        this.loading.set(true);
        try {
            await this.settings.loadSettings();
            if (generation !== this.generation) return;
            const source = await this.data.getPlaylist(row.provider.source_id);
            if (generation !== this.generation) return;
            if (
                !source ||
                !Number.isSafeInteger(row.provider.stream_id) ||
                row.provider.stream_id <= 0
            )
                throw new Error('Unavailable stream');
            const streamUrl = this.urls.constructLiveUrl(
                source,
                row.provider.stream_id
            );
            if (!streamUrl) throw new Error('Unavailable stream');
            const playback: ResolvedPortalPlayback = {
                streamUrl,
                liveAutoTsUrl: this.urls.constructAutoLiveTsUrl(
                    source,
                    row.provider.stream_id
                ),
                title: row.provider.name,
                thumbnail: logo,
                userAgent: source.userAgent,
                referer: source.referrer,
                origin: source.origin,
                isLive: true,
            };
            const sessionKey = `discovery:${this.instanceId}:${row.id}:${generation}`;
            const inline = this.player.isEmbeddedPlayer();
            this.inline.set(inline);
            this.sessionKey.set(sessionKey);
            this.playback.set(playback);
            this.history.defer(
                {
                    sourceId: source.id,
                    sessionKey: inline ? sessionKey : null,
                    streamUrls: [streamUrl],
                },
                () => {
                    void this.recent
                        .recordLivePlayback({
                            uid: buildXtreamCollectionUid(
                                source.id,
                                'live',
                                row.provider.stream_id
                            ),
                            playlistId: source.id,
                            playlistName: source.name,
                            sourceType: 'xtream',
                            contentType: 'live',
                            xtreamId: row.provider.stream_id,
                            name: row.provider.name,
                            logo,
                        })
                        .catch(() => {
                            /* History failure must not interrupt playback. */
                        });
                }
            );
            if (!inline) await this.player.openResolvedPlayback(playback);
        } catch {
            if (generation === this.generation) {
                this.playback.set(null);
                this.error.set(
                    'Unable to open this stream. Try another alternate or refresh the source.'
                );
            }
        } finally {
            if (generation === this.generation) this.loading.set(false);
        }
    }

    openExternal(request: PlaybackFallbackRequest): void {
        request.trackLaunch(
            this.player.openExternalPlayback(request.playback, request.player)
        );
    }
}

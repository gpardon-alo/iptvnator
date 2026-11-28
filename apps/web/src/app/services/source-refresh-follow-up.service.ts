import { inject, Injectable, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { EpgRuntimeBridgeService } from '@iptvnator/epg/data-access';
import {
    EpgPreferencesService,
    EpgSourceSettingsService,
    PlaylistsService,
    SettingsStore,
} from '@iptvnator/services';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import { DiscoveryDictionaryUrlStorage } from '@iptvnator/portal/shared/data-access';
import { PlaylistMeta } from '@iptvnator/shared/interfaces';
import {
    filterPlaylistEpgUrlsForFetch,
    normalizeEpgUrls,
} from '@iptvnator/shared/m3u-utils';

function identity(source: PlaylistMeta): string {
    // Used only for in-memory ownership checks; never log this value.
    return JSON.stringify([
        source._id,
        source.serverUrl,
        source.username,
        source.password,
        source.url,
        source.filePath,
        source.macAddress,
        source.userAgent,
    ]);
}

@Injectable({ providedIn: 'root' })
export class SourceRefreshFollowUpService {
    private readonly playlists = inject(PlaylistsService);
    private readonly dictionaryUrls = inject(DiscoveryDictionaryUrlStorage);
    private readonly settings = inject(SettingsStore);
    private readonly preferences = inject(EpgPreferencesService);
    private readonly sources = inject(EpgSourceSettingsService);
    private readonly bridge = inject(EpgRuntimeBridgeService);
    private readonly snackBar = inject(LazySnackBar);
    private readonly translate = inject(TranslateService);
    private readonly injector = inject(Injector);
    private readonly downloads = new Map<string, Promise<boolean>>();

    async refresh(id: string, active: () => boolean): Promise<void> {
        let dictionaryFailed = false;
        let epgFailed = false;
        const read = async () =>
            (await firstValueFrom(this.playlists.getAllPlaylists())).find(
                (source) => source._id === id
            );
        try {
            const source = await read();
            if (!active() || !source) return;
            const before = identity(source);
            const current = async () => {
                if (!active()) return false;
                const value = await read();
                return active() && !!value && identity(value) === before;
            };
            if (
                source.serverUrl &&
                !source.macAddress &&
                this.dictionaryUrls.read(id).trim()
            ) {
                try {
                    const { DiscoveryDictionaryRefreshService } =
                        await import('@iptvnator/workspace/discovery/feature');
                    if (await current())
                        await this.injector
                            .get(DiscoveryDictionaryRefreshService)
                            .refresh(id, current);
                } catch {
                    dictionaryFailed = true;
                }
            }
            if (!(await current())) return;
            try {
                await this.settings.loadSettings();
                await this.sources.waitForReconciliation();
                const global = normalizeEpgUrls(this.settings.epgUrl());
                const scoped =
                    source.serverUrl || source.macAddress
                        ? []
                        : filterPlaylistEpgUrlsForFetch(
                              source.epgUrls,
                              global,
                              source.manualEpgUrls
                          );
                if (
                    this.preferences.enabled() &&
                    this.bridge.supportsDataManagement
                ) {
                    for (const url of normalizeEpgUrls([
                        ...global,
                        ...scoped,
                    ])) {
                        if (!(await current())) return;
                        if (!(await this.refreshGuide(url))) epgFailed = true;
                    }
                }
            } catch {
                epgFailed = true;
            }
            if (!(await current())) return;
            this.sources.invalidateLookups();
        } catch {
            epgFailed = true;
        }
        if (!active() || (!dictionaryFailed && !epgFailed)) return;
        const steps = [
            ...(dictionaryFailed
                ? [this.translate.instant('SETTINGS.NAV_DICTIONARY')]
                : []),
            ...(epgFailed ? [this.translate.instant('SETTINGS.NAV_EPG')] : []),
        ];
        void this.snackBar.open(
            this.translate.instant('EPG.SOURCE_REFRESH_FAILED', {
                step: steps.join(' / '),
            }),
            this.translate.instant('CLOSE'),
            { duration: 7000 }
        );
    }

    private refreshGuide(url: string): Promise<boolean> {
        const existing = this.downloads.get(url);
        if (existing) return existing;
        const pending = this.bridge
            .forceFetchEpg(url, this.settings.getTrustOptions())
            .then((result) => result?.success === true)
            .catch(() => false)
            .finally(() => {
                if (this.downloads.get(url) === pending)
                    this.downloads.delete(url);
            });
        this.downloads.set(url, pending);
        return pending;
    }
}

import type { StalkerPortalRepairService } from '@iptvnator/portal/stalker/data-access';
import type { PlaylistsService } from '@iptvnator/services';
import {
    isFullStalkerPortalPlaylist,
    isStalkerAccountPlaylist,
    type PlaylistMeta,
} from '@iptvnator/shared/interfaces';
import { stalkerSessionFingerprint } from '@iptvnator/shared/interfaces/stalker-session';
import { firstValueFrom } from 'rxjs';

/** Full source snapshots stay local; sparse inventory cannot authorize cached commands. */
export class StalkerSearchSourceGuard {
    private readonly sources = new Map<string, PlaylistMeta>();

    constructor(
        private readonly playlists: PlaylistsService,
        private readonly repair: StalkerPortalRepairService
    ) {}

    capture(source: PlaylistMeta): boolean {
        const previous = this.sources.get(source._id);
        if (previous) return this.same(previous, source);
        this.sources.set(source._id, { ...source });
        return true;
    }

    async isCurrent(id: string): Promise<boolean> {
        const submitted = this.sources.get(id);
        if (!submitted) return false;
        try {
            const current = await firstValueFrom(
                this.playlists.getPlaylistById(id)
            );
            return (
                !!current &&
                current._id === id &&
                isStalkerAccountPlaylist(current) &&
                this.same(submitted, current)
            );
        } catch {
            return false;
        }
    }

    async invalidSources(): Promise<string[]> {
        const checks = await Promise.all(
            [...this.sources.keys()].map(async (id) => ({
                id,
                valid: await this.isCurrent(id),
            }))
        );
        return checks.filter(({ valid }) => !valid).map(({ id }) => id);
    }

    private same(a: PlaylistMeta, b: PlaylistMeta): boolean {
        const key = (source: PlaylistMeta) => {
            const effective = this.repair.applyOverride(source);
            return JSON.stringify([
                effective.portalUrl,
                isFullStalkerPortalPlaylist(effective),
                stalkerSessionFingerprint(effective),
                effective.sourceSyncRevision,
                effective.userAgent,
                effective.origin,
                effective.referrer,
            ]);
        };
        return key(a) === key(b);
    }
}

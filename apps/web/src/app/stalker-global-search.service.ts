import {
    computed,
    DestroyRef,
    effect,
    inject,
    Injectable,
    linkedSignal,
    type Signal,
    signal,
    untracked,
} from '@angular/core';
import {
    isStalkerItemWithheld,
    loadStalkerSearchPage,
    resolveSearchWithheldCategoryIds,
    StalkerPortalRepairService,
    type StalkerSearchContentType,
    type StalkerSearchPage,
    StalkerSessionService,
} from '@iptvnator/portal/stalker/data-access';
import {
    DataService,
    ParentalLockService,
    PlaylistsService,
    resetHostConnectivityGuard,
} from '@iptvnator/services';
import {
    GLOBAL_SEARCH_MIN_LENGTH,
    isFullStalkerPortalPlaylist,
    isStalkerAccountPlaylist,
    type PlaylistMeta,
} from '@iptvnator/shared/interfaces';
import { stalkerSessionFingerprint } from '@iptvnator/shared/interfaces/stalker-session';
import { firstValueFrom } from 'rxjs';

import type {
    StalkerGlobalSearchContext,
    StalkerGlobalSearchItem,
    StalkerGlobalSearchGroup,
} from './stalker-global-search.models';
export type {
    StalkerGlobalSearchContext,
    StalkerGlobalSearchItem,
    StalkerGlobalSearchGroup,
} from './stalker-global-search.models';
import { StalkerSearchSourceGuard } from './stalker-search-source-guard';
import { appendStalkerSearchItems } from './stalker-global-search-items';

type SearchCriteria = Omit<StalkerGlobalSearchContext, 'sources'>;

interface SearchPortal {
    playlist: PlaylistMeta;
    origins: readonly StalkerSearchContentType[];
    more: readonly StalkerSearchContentType[];
    loading: readonly StalkerSearchContentType[];
    failed: readonly StalkerSearchContentType[];
    items: readonly StalkerGlobalSearchItem[];
}

interface SearchSubmission {
    generation: number;
    criteria: SearchCriteria;
    sources: StalkerSearchSourceGuard;
    portals: ReadonlyMap<string, SearchPortal>;
}

interface SearchJob {
    generation: number;
    playlistId: string;
    origin: StalkerSearchContentType;
}

function sameCriteria(a: SearchCriteria, b: SearchCriteria): boolean {
    return (
        a.term === b.term &&
        a.movies === b.movies &&
        a.series === b.series &&
        a.lockVersion === b.lockVersion
    );
}

const MAX_ACTIVE_PAGES = 2;

@Injectable()
export class StalkerGlobalSearchService {
    private readonly destroyRef = inject(DestroyRef);
    private readonly parentalLock = inject(ParentalLockService);
    private readonly playlists = inject(PlaylistsService);
    private readonly requestDeps = {
        dataService: inject(DataService),
        stalkerSession: inject(StalkerSessionService),
        portalRepair: inject(StalkerPortalRepairService),
    };
    private readonly readContext =
        signal<Signal<StalkerGlobalSearchContext> | null>(null);
    private readonly submission = linkedSignal({
        source: () => this.readContext()?.(),
        computation: (context, previous): SearchSubmission | undefined => {
            const submission = previous?.value;
            if (
                !submission ||
                !context ||
                !sameCriteria(submission.criteria, context)
            ) {
                return undefined;
            }
            return {
                ...submission,
                portals: new Map(
                    [...submission.portals].filter(([, { playlist }]) =>
                        this.isCurrentSource(playlist, context)
                    )
                ),
            };
        },
    });
    private generation = 0;
    private pending: SearchJob[] = [];
    private active = 0;

    readonly groups = computed<readonly StalkerGlobalSearchGroup[]>(() =>
        Array.from(this.submission()?.portals.values() ?? [], (portal) => {
            const { playlist, origins, more, loading, failed, items } = portal;
            const vod = this.withheld(playlist._id, 'vod');
            const series = this.withheld(playlist._id, 'series');
            return {
                playlistId: playlist._id,
                playlistName: playlist.title,
                origins,
                more,
                loading: loading.length > 0,
                hasError: failed.length > 0,
                items: items.filter(
                    ({ item, origin }) =>
                        !isStalkerItemWithheld(
                            item,
                            origin,
                            origin === 'vod' ? vod : series
                        )
                ),
            };
        })
    );

    constructor() {
        // Retire the submission even when the route hides the preview.
        effect(() => {
            this.readContext()?.();
            untracked(this.submission);
        });
        this.destroyRef.onDestroy(() => {
            this.pending = [];
            this.submission.set(undefined);
            this.readContext.set(null);
        });
    }

    async search(
        readContext: Signal<StalkerGlobalSearchContext>
    ): Promise<void> {
        if (this.destroyRef.destroyed) {
            return;
        }
        this.readContext.set(readContext);
        const { sources, ...criteria } = readContext();
        const playlists = sources.filter(isStalkerAccountPlaylist);
        if (
            criteria.term.trim().length < GLOBAL_SEARCH_MIN_LENGTH ||
            !(criteria.movies || criteria.series) ||
            !playlists.length
        ) {
            return;
        }
        const current = this.submission();
        if (current?.portals.size === playlists.length) {
            for (const id of await current.sources.invalidSources()) {
                this.retireSource(current, id);
            }
            return;
        }

        const generation = ++this.generation;
        const origins: StalkerSearchContentType[] = criteria.series
            ? ['vod', 'series']
            : ['vod'];
        this.submission.set({
            generation,
            criteria,
            sources: new StalkerSearchSourceGuard(
                this.playlists,
                this.requestDeps.portalRepair
            ),
            portals: new Map(
                playlists.map((playlist) => [
                    playlist._id,
                    {
                        playlist,
                        origins,
                        more: [],
                        loading: origins,
                        failed: [],
                        items: [],
                    },
                ])
            ),
        });
        this.pending = [];
        for (const origin of origins) {
            for (const { _id: playlistId } of playlists) {
                this.pending.push({ generation, playlistId, origin });
            }
        }
        this.drain();
    }

    async retry(
        playlistId: string,
        readContext: Signal<StalkerGlobalSearchContext>
    ): Promise<void> {
        if (this.destroyRef.destroyed) {
            return;
        }
        this.readContext.set(readContext);
        const submission = this.submission();
        const portal = submission?.portals.get(playlistId);
        if (
            !submission ||
            !portal?.failed.length ||
            !this.isCurrentSource(portal.playlist)
        ) {
            return;
        }
        const jobs = portal.failed.map((origin) => ({
            generation: submission.generation,
            playlistId,
            origin,
        }));
        this.replacePortal(submission, {
            ...portal,
            loading: [...portal.loading, ...portal.failed],
            failed: [],
        });
        const { dataService, portalRepair } = this.requestDeps;
        const { portalUrl } = portalRepair.applyOverride(portal.playlist);
        await resetHostConnectivityGuard(dataService, portalUrl);
        if (this.currentPortal(jobs[0])) {
            this.pending.push(...jobs);
            this.drain();
        }
    }

    async canOpen(item: StalkerGlobalSearchItem): Promise<boolean> {
        const submitted = this.submission();
        if (!submitted || !this.canOpenCurrent(item)) return false;
        if (!(await submitted.sources.isCurrent(item.playlistId))) {
            this.retireSource(submitted, item.playlistId);
            return false;
        }
        return (
            this.submission()?.generation === submitted.generation &&
            this.canOpenCurrent(item)
        );
    }

    private canOpenCurrent(item: StalkerGlobalSearchItem): boolean {
        const portal = this.submission()?.portals.get(item.playlistId);
        return (
            !!portal?.items.includes(item) &&
            this.isCurrentSource(portal.playlist) &&
            !isStalkerItemWithheld(
                item.item,
                item.origin,
                this.withheld(item.playlistId, item.origin)
            )
        );
    }

    private retireSource(submitted: SearchSubmission, id: string): void {
        if (
            this.submission()?.generation !== submitted.generation ||
            !this.submission()?.portals.has(id)
        )
            return;
        const portals = new Map(this.submission()?.portals);
        portals.delete(id);
        this.submission.set({ ...submitted, portals });
        const context = this.readContext();
        if (context) void this.search(context);
    }

    private isCurrentSource(
        submitted: PlaylistMeta,
        context = this.readContext()?.()
    ): boolean {
        const { _id } = submitted;
        const current = context?.sources.find((source) => source._id === _id);
        if (!current || !isStalkerAccountPlaylist(current)) {
            return false;
        }
        const from = this.requestDeps.portalRepair.applyOverride(submitted);
        const to = this.requestDeps.portalRepair.applyOverride(current);
        return (
            from.portalUrl === to.portalUrl &&
            isFullStalkerPortalPlaylist(from) ===
                isFullStalkerPortalPlaylist(to) &&
            stalkerSessionFingerprint(from) === stalkerSessionFingerprint(to)
        );
    }

    private currentPortal(job: SearchJob) {
        const submission = this.submission();
        if (submission?.generation !== job.generation) {
            return undefined;
        }
        const portal = submission.portals.get(job.playlistId);
        return portal && this.isCurrentSource(portal.playlist)
            ? { submission, portal }
            : undefined;
    }

    private drain(): void {
        while (this.active < MAX_ACTIVE_PAGES) {
            const job = this.pending.shift();
            if (!job) {
                return;
            }
            void this.run(job);
        }
    }

    private async run(job: SearchJob): Promise<void> {
        if (!this.currentPortal(job)) {
            return;
        }
        this.active++;
        try {
            // The inventory projection omits the saved portal mode and device identity.
            const playlist = await firstValueFrom(
                this.playlists.getPlaylistById(job.playlistId)
            );
            const current = this.currentPortal(job);
            if (!current) {
                return;
            }
            if (
                playlist?._id !== job.playlistId ||
                !isStalkerAccountPlaylist(playlist)
            ) {
                throw new Error('Stalker source is unavailable');
            }
            if (!current.submission.sources.capture(playlist)) {
                this.retireSource(current.submission, job.playlistId);
                return;
            }
            const page = await loadStalkerSearchPage(
                this.requestDeps,
                playlist,
                job.origin,
                current.submission.criteria.term,
                1,
                { silent: true }
            );
            if (await current.submission.sources.isCurrent(job.playlistId)) {
                this.settle(job, page);
            } else {
                this.retireSource(current.submission, job.playlistId);
            }
        } catch {
            this.settle(job);
        } finally {
            this.active--;
            this.drain();
        }
    }

    private settle(job: SearchJob, page?: StalkerSearchPage): void {
        const current = this.currentPortal(job);
        if (!current) {
            return;
        }
        const { submission, portal } = current;
        const rows = page?.rawItems;
        const total = page?.totalItems;
        const hasMore =
            rows &&
            (total === undefined ? rows.length > 0 : total > rows.length);
        this.replacePortal(submission, {
            ...portal,
            loading: portal.loading.filter((origin) => origin !== job.origin),
            failed: rows ? portal.failed : [...portal.failed, job.origin],
            more: hasMore ? [...portal.more, job.origin] : portal.more,
            items: rows
                ? appendStalkerSearchItems(
                      portal.items,
                      job,
                      submission.criteria,
                      rows,
                      this.withheld(job.playlistId, job.origin)
                  )
                : portal.items,
        });
    }

    private replacePortal(
        submission: SearchSubmission,
        portal: SearchPortal
    ): void {
        const portals = new Map(submission.portals);
        portals.set(portal.playlist._id, portal);
        this.submission.set({ ...submission, portals });
    }

    private withheld(
        playlistId: string,
        origin: StalkerSearchContentType
    ): ReadonlySet<string> {
        return resolveSearchWithheldCategoryIds(
            this.parentalLock,
            playlistId,
            origin
        );
    }
}

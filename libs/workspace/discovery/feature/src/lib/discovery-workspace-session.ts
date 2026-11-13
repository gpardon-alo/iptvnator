import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import { WORKSPACE_CLEAR_SEARCH } from '@iptvnator/workspace/shell/util';
import { DiscoverySourceSession } from './discovery-source-session';

/** Connects Discovery's catalog to the shell's source and URL search state. */
@Injectable()
export class DiscoveryWorkspaceSession {
    private readonly context = inject(PlaylistContextFacade);
    private readonly catalog = inject(DiscoverySourceSession);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly params = toSignal(this.route.queryParamMap, {
        initialValue: this.route.snapshot.queryParamMap,
    });
    readonly query = computed(() => this.params().get('q') ?? '');
    readonly unsupportedSource = computed(() => {
        const active = this.context.activePlaylist();
        return (
            !!active &&
            !this.catalog.sources().some((s) => s._id === active._id)
        );
    });

    constructor() {
        effect(() => {
            if (!this.context.allPlaylistsLoaded()) return;
            const active = this.context.activePlaylist();
            const sources = this.catalog.sources();
            if (!active && sources.length) {
                const remembered = sources.find(
                    (s) => s._id === this.catalog.sourceId()
                );
                this.context.activatePlaylist((remembered ?? sources[0])._id);
                return;
            }
            const id =
                active && sources.some((s) => s._id === active._id)
                    ? active._id
                    : '';
            if (id !== this.catalog.sourceId())
                untracked(() => this.catalog.select(id));
        });
    }

    clearSearch(): void {
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { q: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
            onSameUrlNavigation: 'reload',
            info: WORKSPACE_CLEAR_SEARCH,
        });
    }
}

import { inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SourceActivityService } from './source-activity.service';

/** Renderer-local notifications after a live provider catalog becomes ready. */
@Injectable({ providedIn: 'root' })
export class SourceCatalogUpdatesService {
    private readonly completed = new Subject<string>();
    private readonly followUps = new Set<(id: string) => Promise<void>>();
    private readonly pending = new Map<
        string,
        { running: boolean; again: boolean; notifyLive: boolean }
    >();
    private readonly activity = inject(SourceActivityService);
    readonly liveUpdated$ = this.completed.asObservable();

    liveUpdated(playlistId: string): void {
        if (!this.runFollowUps(playlistId, true))
            this.completed.next(playlistId);
    }

    /** Install app-owned work without making shared services depend on features. */
    afterRefresh(handler: (id: string) => Promise<void>): () => void {
        this.followUps.add(handler);
        return () => this.followUps.delete(handler);
    }

    /** False lets non-app consumers retain their existing scoped EPG path. */
    sourceUpdated(playlistId: string): boolean {
        return this.runFollowUps(playlistId, false);
    }

    private runFollowUps(id: string, notifyLive: boolean): boolean {
        const current = this.pending.get(id);
        if (current) {
            current.again ||= current.running;
            current.notifyLive ||= notifyLive;
            return true;
        }
        if (!this.followUps.size) return false;
        const release = this.activity.begin([id]);
        const state = { running: false, again: false, notifyLive };
        this.pending.set(id, state);
        // Register before invoking handlers: warm PWA catalog reads can notify
        // recursively while a follow-up inspects the accepted catalog.
        const pending = Promise.resolve().then(async () => {
            try {
                state.running = true;
                do {
                    state.again = false;
                    for (const handler of [...this.followUps]) {
                        try {
                            await handler(id);
                        } catch {
                            // A failed step must not drop a newer accepted catalog.
                        }
                    }
                } while (state.again);
            } finally {
                this.pending.delete(id);
                try {
                    if (state.notifyLive) this.completed.next(id);
                } finally {
                    release();
                }
            }
        });
        // Each app handler reports its own fixed, redacted failure message.
        void pending.catch(() => undefined);
        return true;
    }
}

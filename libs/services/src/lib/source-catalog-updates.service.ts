import { inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SourceActivityService } from './source-activity.service';

/** Renderer-local notifications after a live provider catalog becomes ready. */
@Injectable({ providedIn: 'root' })
export class SourceCatalogUpdatesService {
    private readonly completed = new Subject<string>();
    private readonly followUps = new Set<(id: string) => Promise<void>>();
    private readonly pending = new Map<string, Promise<void>>();
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
        if (this.pending.has(id)) return true;
        if (!this.followUps.size) return false;
        const release = this.activity.begin([id]);
        const handlers = [...this.followUps];
        // Register before invoking handlers: warm PWA catalog reads can notify
        // recursively while a follow-up inspects the accepted catalog.
        const pending = Promise.resolve().then(async () => {
            try {
                for (const handler of handlers) await handler(id);
            } finally {
                this.pending.delete(id);
                try {
                    if (notifyLive) this.completed.next(id);
                } finally {
                    release();
                }
            }
        });
        this.pending.set(id, pending);
        // Each app handler reports its own fixed, redacted failure message.
        void pending.catch(() => undefined);
        return true;
    }
}

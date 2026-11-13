import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Renderer-local notifications after a live provider catalog becomes ready. */
@Injectable({ providedIn: 'root' })
export class SourceCatalogUpdatesService {
    private readonly completed = new Subject<string>();
    readonly liveUpdated$ = this.completed.asObservable();

    liveUpdated(playlistId: string): void {
        this.completed.next(playlistId);
    }
}

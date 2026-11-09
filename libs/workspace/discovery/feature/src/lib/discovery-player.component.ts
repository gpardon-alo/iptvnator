import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
} from '@angular/core';
import { ClassifiedStream } from '@iptvnator/portal/shared/util';
import { WebPlayerViewComponent } from '@iptvnator/ui/playback';
import { DiscoveryPlaybackSession } from './discovery-playback-session';

@Component({
    selector: 'app-discovery-player',
    standalone: true,
    imports: [WebPlayerViewComponent],
    providers: [DiscoveryPlaybackSession],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            :host {
                display: flex;
                flex: 1;
                width: 100%;
                min-height: 0;
                align-items: center;
                justify-content: center;
            }
            app-web-player-view {
                display: block;
                width: 100%;
                height: 100%;
                min-height: 0;
            }
            p {
                padding: 16px;
            }
        `,
    ],
    template: `
        @if (session.loading()) {
            <p role="status">Opening stream…</p>
        } @else if (session.error()) {
            <div role="alert">
                <p>{{ session.error() }}</p>
                <button type="button" (click)="retry()">Retry stream</button>
            </div>
        } @else if (session.playback(); as playback) {
            @if (session.inline()) {
                <app-web-player-view
                    [streamUrl]="playback.streamUrl"
                    [playback]="playback"
                    [title]="playback.title"
                    [playbackSessionKey]="session.sessionKey()"
                    (externalFallbackRequested)="session.openExternal($event)"
                />
            } @else {
                <p role="status">Opened in your selected external player.</p>
            }
        } @else {
            <p>Demo channel · select a saved source to watch live video.</p>
        }
    `,
})
export class DiscoveryPlayerComponent {
    readonly row = input<ClassifiedStream | null>(null);
    readonly logo = input('');
    readonly session = inject(DiscoveryPlaybackSession);
    constructor() {
        effect((onCleanup) => {
            void this.session.play(this.row(), this.logo());
            onCleanup(() => this.session.close());
        });
    }
    retry(): void {
        void this.session.play(this.row(), this.logo());
    }
}

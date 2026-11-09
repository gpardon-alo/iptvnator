import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClassifiedStream } from '@iptvnator/portal/shared/util';
import { EpgTimelineComponent } from '@iptvnator/ui/epg';
import { DiscoveryGuideSession } from './discovery-guide-session';

@Component({
    selector: 'app-discovery-guide',
    imports: [EpgTimelineComponent, RouterLink],
    providers: [DiscoveryGuideSession],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            :host {
                display: block;
                min-width: 0;
                height: 260px;
                // Discovery has its own dark canvas, independent of the app preset.
                --app-content-bg: var(--app-discovery-background);
                --app-widget-bg: var(--app-discovery-panel);
                --app-widget-header-bg: var(--app-discovery-panel);
                --app-widget-header-border: var(--app-discovery-border);
                --app-separator: var(--app-discovery-border);
                --app-on-surface: var(--app-text-color);
                --app-card-hover-bg: var(--app-selection-surface);
            }
            :host(.collapsed) {
                height: 64px;
            }
            .disabled {
                padding: 16px;
                color: var(--app-muted-color);
            }
            a {
                color: var(--app-selection-text-color);
            }
        `,
    ],
    host: { '[class.collapsed]': 'collapsed()' },
    template: `
        @if (session.enabled()) {
            <app-epg-timeline
                [programs]="session.programs()"
                [channelName]="row()?.name ?? ''"
                [channelLogo]="logo()"
                [sourceLabel]="'Xtream'"
                [offsetMinutes]="session.offsetMinutes()"
                [loading]="session.loading()"
                [collapsed]="collapsed()"
                [selectedDate]="date()"
                [archiveContextKey]="row()?.id ?? null"
                [emptyReason]="session.failed() ? 'error' : 'none'"
                (collapsedChange)="collapsed.set($event)"
                (selectedDateChange)="date.set($event)"
                (retry)="reload()"
                (openEpgSettings)="openSettings()"
            />
        } @else {
            <p class="disabled">
                Programming guide is disabled.
                <a routerLink="/workspace/settings/epg">Open EPG settings</a>
            </p>
        }
    `,
})
export class DiscoveryGuideComponent {
    private readonly router = inject(Router);
    openSettings(): void {
        void this.router.navigateByUrl('/workspace/settings/epg');
    }
    readonly row = input<ClassifiedStream | null>(null);
    readonly logo = input('');
    readonly epgChannelId = input('');
    readonly session = inject(DiscoveryGuideSession);
    readonly collapsed = signal(false);
    readonly date = signal<string | null>(null);
    constructor() {
        effect((cleanup) => {
            const row = this.row();
            this.session.enabled();
            this.date.set(null);
            void this.session.load(row, this.epgChannelId());
            cleanup(() => this.session.close());
        });
    }
    reload(): void {
        void this.session.load(this.row(), this.epgChannelId());
    }
}

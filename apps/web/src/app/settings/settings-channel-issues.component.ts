import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { ChannelIssuesService } from '@iptvnator/services';

@Component({
    selector: 'app-settings-channel-issues',
    imports: [DatePipe, MatButton, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="issues" aria-labelledby="channel-issues-title">
            <h3 id="channel-issues-title">
                {{ 'CHANNEL_ISSUES.TITLE' | translate }}
            </h3>
            <p>{{ 'CHANNEL_ISSUES.DESCRIPTION' | translate }}</p>
            <div class="actions">
                @for (kind of kinds; track kind) {
                    <button
                        mat-button
                        [attr.aria-pressed]="filter() === kind"
                        (click)="filter.set(kind); limit.set(100)"
                    >
                        {{
                            (kind === 'epg'
                                ? 'SETTINGS.NAV_EPG'
                                : 'CHANNEL_ISSUES.' + kind.toUpperCase()
                            ) | translate
                        }}
                        ({{ count(kind) }})
                    </button>
                }
                <button
                    mat-button
                    [disabled]="!reports.issues().length"
                    (click)="exportIssues()"
                >
                    {{ 'CHANNEL_ISSUES.EXPORT' | translate }}
                </button>
            </div>
            @if (reports.storageFailed()) {
                <p role="alert">
                    {{ 'CHANNEL_ISSUES.STORAGE_ERROR' | translate }}
                </p>
            }
            <ul>
                @for (
                    issue of filtered().slice(0, limit());
                    track issue.sourceId +
                        ':' +
                        issue.streamId +
                        ':' +
                        issue.kind
                ) {
                    <li>
                        <strong>{{ issue.name || issue.streamId }}</strong>
                        <span>{{
                            'CHANNEL_ISSUES.' +
                                issue.reason.toUpperCase().replace('-', '_')
                                | translate
                        }}</span>
                        <small
                            >{{ issue.sourceId }} · {{ issue.streamId }} ·
                            {{ issue.lastSeen | date: 'short' }}</small
                        >
                    </li>
                } @empty {
                    <li>{{ 'CHANNEL_ISSUES.EMPTY' | translate }}</li>
                }
            </ul>
            @if (filtered().length > limit()) {
                <button mat-button (click)="limit.update(more)">
                    {{ 'SHOW_MORE' | translate }}
                </button>
            }
        </section>
    `,
    styles: `
        :host {
            display: block;
            margin-top: 24px;
            color: var(--app-on-surface);
        }
        p,
        small {
            color: var(--app-muted-color);
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        button {
            app-region: no-drag;
        }
        button[aria-pressed='true'] {
            color: var(--app-selection-text-color);
            background: var(--app-selection-surface);
        }
        ul {
            list-style: none;
            padding: 0;
        }
        li {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 0;
            border-bottom: 1px solid var(--app-separator);
            overflow-wrap: anywhere;
        }
    `,
})
export class SettingsChannelIssuesComponent {
    readonly reports = inject(ChannelIssuesService);
    readonly kinds = ['all', 'logo', 'epg'] as const;
    readonly filter = signal<'all' | 'logo' | 'epg'>('all');
    readonly limit = signal(100);
    readonly more = (value: number) => value + 100;
    readonly filtered = computed(() =>
        [...this.reports.issues()]
            .filter(
                (issue) =>
                    this.filter() === 'all' || issue.kind === this.filter()
            )
            .sort((a, b) => b.lastSeen - a.lastSeen)
    );
    count(kind: 'all' | 'logo' | 'epg'): number {
        return this.reports
            .issues()
            .filter((issue) => kind === 'all' || issue.kind === kind).length;
    }
    exportIssues(): void {
        const url = URL.createObjectURL(
            new Blob([this.reports.exportJson()], { type: 'application/json' })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'channel-issues.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

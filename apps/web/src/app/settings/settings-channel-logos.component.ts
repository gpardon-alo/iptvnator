import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MatButton } from '@angular/material/button';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ChannelLogoService } from '@iptvnator/services';
import type { LogoControl } from '@iptvnator/shared/channel-enrichment';

@Component({
    selector: 'app-settings-channel-logos',
    imports: [TranslatePipe, MatButton, MatSlideToggle],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (logos.supported) {
            <section
                class="settings-group"
                id="channel-logos"
                data-test-id="channel-logo-settings"
            >
                <header class="settings-group__header">
                    <h2>{{ 'CHANNEL_LOGOS.TITLE' | translate }}</h2>
                    <p>{{ 'CHANNEL_LOGOS.DESCRIPTION' | translate }}</p>
                </header>
                <div class="settings-card">
                    <mat-slide-toggle
                        [checked]="logos.status()?.enabled ?? false"
                        [disabled]="busy()"
                        (change)="enable($event.checked)"
                    >
                        {{ 'CHANNEL_LOGOS.ENABLE' | translate }}
                    </mat-slide-toggle>
                    <button
                        mat-stroked-button
                        type="button"
                        [disabled]="
                            busy() ||
                            !logos.status()?.enabled ||
                            logos.status()?.running
                        "
                        (click)="command({ action: 'run' })"
                    >
                        {{ 'CHANNEL_LOGOS.RUN' | translate }}
                    </button>
                    @if (logos.status(); as status) {
                        <p role="status" aria-live="polite">
                            {{ 'CHANNEL_LOGOS.COUNTS' | translate: status }}
                            @if (status.running) {
                                {{ 'CHANNEL_LOGOS.RUNNING' | translate }}
                            }
                        </p>
                        @if (status.error) {
                            <p role="alert">
                                {{ 'CHANNEL_LOGOS.RETRY' | translate }}
                            </p>
                        }
                    }
                    @if (failed()) {
                        <p role="alert">
                            {{ 'CHANNEL_LOGOS.ERROR' | translate }}
                        </p>
                    }
                </div>
            </section>
        }
    `,
})
export class SettingsChannelLogosComponent {
    readonly logos = inject(ChannelLogoService);
    readonly busy = signal(false);
    readonly failed = signal(false);

    constructor() {
        if (!this.logos.supported) return;
        void this.command({ action: 'status' });
        const timer = setInterval(
            () => void this.command({ action: 'status' }),
            5000
        );
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }

    enable(enabled: boolean): void {
        void this.command({ action: 'enable', enabled });
    }

    async command(request: LogoControl): Promise<void> {
        if (this.busy()) return;
        this.busy.set(true);
        this.failed.set(false);
        try {
            await this.logos.control(request);
        } catch {
            this.failed.set(true);
        } finally {
            this.busy.set(false);
        }
    }
}

import {
    Directive,
    ElementRef,
    effect,
    inject,
    input,
    untracked,
} from '@angular/core';
import { ChannelIssueRef, ChannelIssuesService } from '@iptvnator/services';

/** Observe the actual channel artwork, including non-bubbling image errors. */
@Directive({ selector: '[appChannelIssue]' })
export class ChannelLogoIssueDirective {
    readonly channelIssue = input<ChannelIssueRef>(undefined, {
        alias: 'appChannelIssue',
    });
    readonly channelLogo = input<string | null>();
    readonly channelLogoFailed = input(false);
    private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
    private readonly issues = inject(ChannelIssuesService);

    constructor() {
        effect((cleanup) => {
            const ref = this.channelIssue();
            const url = this.channelLogo()?.trim();
            const failed = this.channelLogoFailed();
            if (!ref) return;
            if (
                !url ||
                /(?:^|\/)(?:blank-icon\.(?:png|jpe?g|webp|gif|svg)|assets\/icons\/icon-64\.png)(?:[?#].*)?$/i.test(
                    url
                )
            ) {
                untracked(() => this.issues.report(ref, 'missing-url'));
                return;
            }
            if (failed) {
                untracked(() => this.issues.report(ref, 'image-error'));
                return;
            }
            const matches = (
                target: EventTarget | null
            ): target is HTMLImageElement =>
                target instanceof HTMLImageElement &&
                target.getAttribute('src')?.trim() === url;
            const load = (event: Event) => {
                if (matches(event.target)) this.issues.resolve(ref, 'logo');
            };
            const error = (event: Event) => {
                if (matches(event.target))
                    this.issues.report(ref, 'image-error');
            };
            this.host.addEventListener('load', load, true);
            this.host.addEventListener('error', error, true);
            let active = true;
            queueMicrotask(() => {
                if (!active) return;
                for (const image of this.host.querySelectorAll('img')) {
                    if (matches(image) && image.complete) {
                        if (image.naturalWidth > 0)
                            this.issues.resolve(ref, 'logo');
                        else if (image.currentSrc)
                            this.issues.report(ref, 'image-error');
                    }
                }
            });
            cleanup(() => {
                active = false;
                this.host.removeEventListener('load', load, true);
                this.host.removeEventListener('error', error, true);
            });
        });
    }
}

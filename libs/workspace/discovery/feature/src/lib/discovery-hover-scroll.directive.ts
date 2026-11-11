import { DOCUMENT } from '@angular/common';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
    DestroyRef,
    Directive,
    ElementRef,
    inject,
    input,
    NgZone,
} from '@angular/core';

/** Continuous pointer scrolling; native clicks and keyboard activation stay available. */
@Directive({
    selector: '[discoveryHoverScroll]',
    standalone: true,
    host: {
        '(pointerenter)': 'start($event)',
        '(pointerleave)': 'stop()',
        '(pointercancel)': 'stop()',
    },
})
export class DiscoveryHoverScrollDirective {
    readonly discoveryHoverScroll = input.required<number>();
    readonly scrollViewport = input<CdkVirtualScrollViewport>();
    private readonly document = inject(DOCUMENT);
    private readonly zone = inject(NgZone);
    private readonly element =
        inject<ElementRef<HTMLButtonElement>>(ElementRef);
    private frame: number | undefined;

    constructor() {
        const stop = () => this.stop();
        this.document.addEventListener('visibilitychange', stop);
        this.document.defaultView?.addEventListener('blur', stop);
        inject(DestroyRef).onDestroy(() => {
            this.stop();
            this.document.removeEventListener('visibilitychange', stop);
            this.document.defaultView?.removeEventListener('blur', stop);
        });
    }

    start(event: PointerEvent): void {
        this.stop();
        const window = this.document.defaultView;
        if (
            event.pointerType !== 'mouse' ||
            !window ||
            this.element.nativeElement.disabled ||
            !this.scrollViewport()
        )
            return;
        this.zone.runOutsideAngular(() => {
            let previous: number | undefined;
            const tick = (time: number) => {
                const viewport = this.scrollViewport();
                if (!viewport || this.document.hidden) {
                    this.stop();
                    return;
                }
                if (previous !== undefined) {
                    const offset = viewport.measureScrollOffset('start');
                    viewport.scrollToOffset(
                        offset +
                            this.discoveryHoverScroll() *
                                Math.min(time - previous, 64) *
                                0.45
                    );
                }
                previous = time;
                this.frame = window.requestAnimationFrame(tick);
            };
            this.frame = window.requestAnimationFrame(tick);
        });
    }

    stop(): void {
        if (this.frame !== undefined) {
            this.document.defaultView?.cancelAnimationFrame(this.frame);
            this.frame = undefined;
        }
    }
}

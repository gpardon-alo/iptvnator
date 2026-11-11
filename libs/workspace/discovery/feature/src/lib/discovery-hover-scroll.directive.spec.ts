import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiscoveryHoverScrollDirective } from './discovery-hover-scroll.directive';

@Component({
    imports: [DiscoveryHoverScrollDirective],
    template: `<button
        [discoveryHoverScroll]="direction()"
        [scrollViewport]="viewport()"
        [disabled]="disabled()"
        (click)="clicks = clicks + 1"
    >
        Next
    </button>`,
})
class HoverScrollHost {
    direction = signal(1);
    disabled = signal(false);
    clicks = 0;
    viewport = signal<CdkVirtualScrollViewport | undefined>(undefined);
}

describe('Discovery ribbon hover scrolling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function setup() {
        const scroll = jest.fn();
        const fixture = TestBed.createComponent(HoverScrollHost);
        fixture.componentInstance.viewport.set({
            measureScrollOffset: () => 100,
            scrollToOffset: scroll,
        } as unknown as CdkVirtualScrollViewport);
        fixture.detectChanges();
        const button = fixture.debugElement.query(
            By.directive(DiscoveryHoverScrollDirective)
        );
        const enter = (pointerType = 'mouse') =>
            button.triggerEventHandler('pointerenter', { pointerType });
        return { fixture, button, scroll, enter };
    }

    it('scrolls continuously in either direction and leaves native clicks available', () => {
        const { fixture, button, enter, scroll } = setup();
        enter();
        jest.advanceTimersByTime(64);
        expect(scroll.mock.calls.length).toBeGreaterThan(1);
        expect(scroll.mock.lastCall?.[0]).toBeGreaterThan(100);
        fixture.componentInstance.direction.set(-1);
        fixture.detectChanges();
        jest.advanceTimersByTime(32);
        expect(scroll.mock.lastCall?.[0]).toBeLessThan(100);
        button.nativeElement.click();
        expect(fixture.componentInstance.clicks).toBe(1);
        fixture.destroy();
    });

    it('cancels work on pointer exit, cancellation, window blur, visibility change and destruction', () => {
        const { fixture, button, enter, scroll } = setup();
        for (const stop of [
            () => button.triggerEventHandler('pointerleave'),
            () => button.triggerEventHandler('pointercancel'),
            () => window.dispatchEvent(new Event('blur')),
            () => document.dispatchEvent(new Event('visibilitychange')),
            () => fixture.destroy(),
        ]) {
            enter();
            jest.advanceTimersByTime(64);
            expect(scroll).toHaveBeenCalled();
            stop();
            scroll.mockClear();
            jest.advanceTimersByTime(64);
            expect(scroll).not.toHaveBeenCalled();
        }
    });

    it('does not start on touch, disabled controls or an empty ribbon', () => {
        const { fixture, enter, scroll } = setup();
        enter('touch');
        jest.advanceTimersByTime(64);
        fixture.componentInstance.disabled.set(true);
        fixture.detectChanges();
        enter();
        jest.advanceTimersByTime(64);
        fixture.componentInstance.disabled = signal(false);
        fixture.componentInstance.viewport.set(undefined);
        fixture.detectChanges();
        enter();
        jest.advanceTimersByTime(64);
        expect(scroll).not.toHaveBeenCalled();
        fixture.destroy();
    });
});

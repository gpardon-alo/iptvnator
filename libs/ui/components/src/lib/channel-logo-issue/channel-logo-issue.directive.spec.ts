import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChannelIssuesService, ChannelIssueRef } from '@iptvnator/services';
import { ChannelLogoIssueDirective } from './channel-logo-issue.directive';

@Component({
    imports: [ChannelLogoIssueDirective],
    template: ` <div [appChannelIssue]="ref()" [channelLogo]="url()">
        <img [src]="url()" alt="Synthetic channel logo" />
    </div>`,
})
class Host {
    ref = signal<ChannelIssueRef>({
        sourceId: 'synthetic',
        streamId: 1,
        name: 'Example channel',
    });
    url = signal('');
}
describe('observed channel artwork issues', () => {
    let issues: { report: jest.Mock; resolve: jest.Mock };
    beforeEach(() => {
        issues = { report: jest.fn(), resolve: jest.fn() };
        TestBed.configureTestingModule({
            imports: [Host],
            providers: [{ provide: ChannelIssuesService, useValue: issues }],
        });
    });
    it('reports absent artwork and non-bubbling image errors, then clears on a successful load', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        expect(issues.report).toHaveBeenCalledWith(
            fixture.componentInstance.ref(),
            'missing-url'
        );
        fixture.componentInstance.url.set('https://example.test/logo.png');
        fixture.detectChanges();
        const image: HTMLImageElement =
            fixture.nativeElement.querySelector('img');
        image.dispatchEvent(new Event('error', { bubbles: false }));
        expect(issues.report).toHaveBeenLastCalledWith(
            fixture.componentInstance.ref(),
            'image-error'
        );
        image.dispatchEvent(new Event('load', { bubbles: false }));
        expect(issues.resolve).toHaveBeenLastCalledWith(
            fixture.componentInstance.ref(),
            'logo'
        );
    });
    it('recognizes the Discovery placeholder and keeps reused rows scoped to the current stream', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.componentInstance.url.set('assets/icons/icon-64.png');
        fixture.detectChanges();
        expect(issues.report).toHaveBeenCalledWith(
            fixture.componentInstance.ref(),
            'missing-url'
        );
        fixture.componentInstance.ref.set({
            sourceId: 'second',
            streamId: 2,
            name: 'Example second',
        });
        fixture.componentInstance.url.set('https://example.test/second.png');
        fixture.detectChanges();
        const image: HTMLImageElement =
            fixture.nativeElement.querySelector('img');
        image.setAttribute('src', 'https://example.test/stale.png');
        image.dispatchEvent(new Event('error'));
        expect(issues.report).toHaveBeenCalledTimes(1);
        image.setAttribute('src', 'https://example.test/second.png');
        image.dispatchEvent(new Event('error'));
        expect(issues.report).toHaveBeenLastCalledWith(
            fixture.componentInstance.ref(),
            'image-error'
        );
    });
});

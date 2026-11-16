import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChannelLogoService } from '@iptvnator/services';
import { SettingsChannelLogosComponent } from './settings-channel-logos.component';
import type { LogoControl } from '@iptvnator/shared/channel-enrichment';

it('allows enabling repairs while a periodic status read is pending', async () => {
    let finishStatus!: () => void;
    const control = jest.fn((request: LogoControl) =>
        request.action === 'status'
            ? new Promise<void>((resolve) => {
                  finishStatus = resolve;
              })
            : Promise.resolve()
    );
    TestBed.configureTestingModule({
        providers: [
            {
                provide: ChannelLogoService,
                useValue: {
                    supported: true,
                    status: signal(null),
                    control,
                },
            },
        ],
    });
    try {
        const component = TestBed.runInInjectionContext(
            () => new SettingsChannelLogosComponent()
        );
        component.enable(true);
        await Promise.resolve();
        expect(control).toHaveBeenCalledWith({
            action: 'enable',
            enabled: true,
        });
        finishStatus();
        await Promise.resolve();
    } finally {
        TestBed.resetTestingModule();
    }
});

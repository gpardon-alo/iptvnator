import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
    ChannelLogoService,
    injectChannelLogoFallback,
} from './channel-logo.service';
import type { LogoLookup } from '@iptvnator/shared/channel-enrichment';

describe('desktop channel artwork fallback', () => {
    const dataUrl = 'data:image/png;base64,c3ludGhldGlj';
    const ref: LogoLookup = { sourceId: 'fixture-source', streamId: 101 };
    const previous = Object.getOwnPropertyDescriptor(window, 'electron');
    let lookup: jest.Mock;
    let control: jest.Mock;
    beforeEach(() => {
        control = jest
            .fn()
            .mockResolvedValue({ enabled: true, running: false });
        lookup = jest
            .fn()
            .mockResolvedValue([{ ...ref, hash: 'a'.repeat(64), dataUrl }]);
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: { channelLogoControl: control, channelLogoLookup: lookup },
        });
    });
    afterEach(() => {
        TestBed.resetTestingModule();
        if (previous) Object.defineProperty(window, 'electron', previous);
        else Reflect.deleteProperty(window, 'electron');
    });
    async function settle() {
        for (let i = 0; i < 12; i++) await Promise.resolve();
    }
    it('does not request repairs for working provider artwork', async () => {
        TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(
                () => ref,
                () => false
            )
        );
        TestBed.tick();
        await settle();
        expect(lookup).not.toHaveBeenCalled();
        expect(control).not.toHaveBeenCalled();
    });
    it('deduplicates references and replaces a failed/missing logo asynchronously', async () => {
        const needed = signal(false);
        const first = TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(() => ref, needed)
        );
        const second = TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(() => ref, needed)
        );
        TestBed.tick();
        needed.set(true);
        TestBed.tick();
        await settle();
        expect(first()).toBe(dataUrl);
        expect(second()).toBe(dataUrl);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup.mock.calls[0][0]).toHaveLength(1);
    });
    it('clears fallback artwork when disabled without changing provider data', async () => {
        const result = TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(
                () => ref,
                () => true
            )
        );
        TestBed.tick();
        await settle();
        expect(result()).toBe(dataUrl);
        control.mockResolvedValue({ enabled: false });
        await TestBed.inject(ChannelLogoService).control({
            action: 'enable',
            enabled: false,
        });
        await settle();
        expect(result()).toBe('');
    });
    it('discards a pending lookup that completes after disable', async () => {
        let finish!: (results: unknown[]) => void;
        lookup.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const result = TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(
                () => ref,
                () => true
            )
        );
        TestBed.tick();
        await settle();
        expect(lookup).toHaveBeenCalledTimes(1);
        control.mockResolvedValue({ enabled: false });
        await TestBed.inject(ChannelLogoService).control({
            action: 'enable',
            enabled: false,
        });
        finish([{ ...ref, hash: 'a'.repeat(64), dataUrl }]);
        await settle();
        expect(result()).toBe('');
    });
    it('does nothing in a browser without the specific logo capabilities', async () => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {},
        });
        const result = TestBed.runInInjectionContext(() =>
            injectChannelLogoFallback(
                () => ref,
                () => true
            )
        );
        TestBed.tick();
        await settle();
        expect(result()).toBe('');
        expect(lookup).not.toHaveBeenCalled();
    });
});

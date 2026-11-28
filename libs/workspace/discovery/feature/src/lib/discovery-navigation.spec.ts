import { signal } from '@angular/core';
import {
    DiscoveryComponent,
    discoveryPreviewLogo,
} from './discovery.component';

describe('Discovery playback keyboard ownership', () => {
    const navigate = (key: string, panel = false, handled = false) => {
        const player = document.createElement('app-discovery-player');
        const video = document.createElement('video');
        player.append(video);
        if (panel) {
            const popup = document.createElement('div');
            popup.className = 'player-controls__panel';
            player.append(popup);
        }
        const event = new KeyboardEvent('keydown', { key, cancelable: true });
        Object.defineProperty(event, 'target', { value: video });
        if (handled) event.preventDefault();
        const state = { watching: signal(true) };
        DiscoveryComponent.prototype.navigate.call(
            state as DiscoveryComponent,
            event
        );
        return state.watching();
    };
    it('closes the preview for an unhandled Escape from the video', () => {
        expect(navigate('Escape')).toBe(false);
    });
    it('preserves player shortcut, popup and handled-event ownership', () => {
        expect(navigate('ArrowLeft')).toBe(true);
        expect(navigate('Escape', true)).toBe(true);
        expect(navigate('Escape', false, true)).toBe(true);
    });
    it('leaves Escape to native fullscreen before dismissing the preview', () => {
        const original = Object.getOwnPropertyDescriptor(
            document,
            'fullscreenElement'
        );
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.createElement('video'),
        });
        try {
            expect(navigate('Escape')).toBe(true);
        } finally {
            if (original)
                Object.defineProperty(document, 'fullscreenElement', original);
            else Reflect.deleteProperty(document, 'fullscreenElement');
        }
    });
});

describe('Discovery playback logo fallback', () => {
    it.each([
        '',
        'assets/icons/icon-64.png',
        '/assets/icons/icon-64.png?v=1',
        'https://artwork.example.test/blank-icon.png',
    ])('uses the neutral fallback for %s', (logo) =>
        expect(discoveryPreviewLogo(logo)).toBe('')
    );
    it('keeps channel artwork', () =>
        expect(
            discoveryPreviewLogo(' https://artwork.example.test/channel.svg ')
        ).toBe('https://artwork.example.test/channel.svg'));
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { DiscoverySourceSession } from './discovery-source-session';
import { selectDiscoveryRouteSource } from './discovery-route-source';

describe('Discovery source navigation', () => {
    const sources = signal([{ _id: 'synthetic-a' }, { _id: 'synthetic-b' }]);
    let info: { discoverySourceId?: string };
    let select: jest.Mock;
    const start = () =>
        TestBed.runInInjectionContext(() =>
            selectDiscoveryRouteSource({
                sources,
                select,
            } as unknown as DiscoverySourceSession)
        );
    beforeEach(() => {
        sources.set([{ _id: 'synthetic-a' }, { _id: 'synthetic-b' }]);
        info = { discoverySourceId: 'synthetic-a' };
        select = jest.fn();
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: Router,
                    useValue: {
                        currentNavigation: () => ({ extras: { info } }),
                        lastSuccessfulNavigation: () => null,
                    },
                },
            ],
        });
    });
    it('selects the refreshed source once while allowing later manual source changes', () => {
        start();
        TestBed.flushEffects();
        expect(select).toHaveBeenCalledWith('synthetic-a');
        sources.set([{ _id: 'synthetic-b' }, { _id: 'synthetic-a' }]);
        TestBed.flushEffects();
        expect(select).toHaveBeenCalledTimes(1);
    });
    it('waits for an eligible source without loading an unknown source', () => {
        sources.set([]);
        start();
        TestBed.flushEffects();
        expect(select).not.toHaveBeenCalled();
        sources.set([{ _id: 'synthetic-a' }]);
        TestBed.flushEffects();
        expect(select).toHaveBeenCalledWith('synthetic-a');
    });
    it('keeps the saved selection for ordinary navigation, Back and reload', () => {
        info = {};
        start();
        TestBed.flushEffects();
        expect(select).not.toHaveBeenCalled();
    });
});

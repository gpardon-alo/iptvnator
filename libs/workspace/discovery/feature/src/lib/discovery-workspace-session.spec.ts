import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import { WORKSPACE_CLEAR_SEARCH } from '@iptvnator/workspace/shell/util';
import { DiscoverySourceSession } from './discovery-source-session';
import { DiscoveryWorkspaceSession } from './discovery-workspace-session';

describe('Discovery workspace connection', () => {
    const a = { _id: 'synthetic-a', serverUrl: 'https://provider.example' };
    const b = { _id: 'synthetic-b', serverUrl: 'https://provider.example' };
    const active = signal<{ _id: string; serverUrl?: string } | null>(a);
    const loaded = signal(true);
    const sourceId = signal('synthetic-b');
    const params = new BehaviorSubject(convertToParamMap({ q: 'Synthetic' }));
    let select: jest.Mock;
    let activate: jest.Mock;
    let navigate: jest.Mock;
    let session: DiscoveryWorkspaceSession;

    beforeEach(() => {
        active.set(a);
        loaded.set(true);
        sourceId.set(b._id);
        params.next(convertToParamMap({ q: 'Synthetic' }));
        select = jest.fn((id) => sourceId.set(id));
        activate = jest.fn((id) => active.set(id === a._id ? a : b));
        navigate = jest.fn().mockResolvedValue(true);
        TestBed.configureTestingModule({
            providers: [
                DiscoveryWorkspaceSession,
                {
                    provide: DiscoverySourceSession,
                    useValue: { sourceId, sources: signal([a, b]), select },
                },
                {
                    provide: PlaylistContextFacade,
                    useValue: {
                        activePlaylist: active,
                        allPlaylistsLoaded: loaded,
                        activatePlaylist: activate,
                    },
                },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        queryParamMap: params,
                        snapshot: { queryParamMap: params.value },
                    },
                },
                { provide: Router, useValue: { navigate } },
            ],
        });
        session = TestBed.inject(DiscoveryWorkspaceSession);
    });

    it('inherits the shell selection and follows source switches without navigation', () => {
        TestBed.flushEffects();
        expect(select).toHaveBeenLastCalledWith(a._id);
        active.set(b);
        TestBed.flushEffects();
        expect(select).toHaveBeenLastCalledWith(b._id);
        expect(navigate).not.toHaveBeenCalled();
    });
    it('waits for the library before restoring a remembered eligible source', () => {
        loaded.set(false);
        active.set(null);
        TestBed.flushEffects();
        expect(activate).not.toHaveBeenCalled();
        loaded.set(true);
        TestBed.flushEffects();
        expect(activate).toHaveBeenCalledWith(b._id);
    });
    it('shows unsupported sources without falling back to another source', () => {
        active.set({ _id: 'synthetic-m3u' });
        TestBed.flushEffects();
        expect(session.unsupportedSource()).toBe(true);
        expect(select).toHaveBeenLastCalledWith('');
        expect(activate).not.toHaveBeenCalled();
    });
    it('reads URL search on entry and history changes, including clearing', () => {
        expect(session.query()).toBe('Synthetic');
        params.next(convertToParamMap({ q: 'History' }));
        expect(session.query()).toBe('History');
        params.next(convertToParamMap({}));
        expect(session.query()).toBe('');
    });
    it('clears pending shell typing as well as the URL when all filters are cleared', () => {
        session.clearSearch();
        expect(navigate).toHaveBeenCalledWith(
            [],
            expect.objectContaining({
                queryParams: { q: null },
                queryParamsHandling: 'merge',
                replaceUrl: true,
                onSameUrlNavigation: 'reload',
                info: WORKSPACE_CLEAR_SEARCH,
            })
        );
    });
});

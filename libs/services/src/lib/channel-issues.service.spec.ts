import { TestBed } from '@angular/core/testing';
import * as connection from './source-sync/source-connection';
import {
    CHANNEL_ISSUE_STORAGE,
    ChannelIssuesService,
} from './channel-issues.service';

const ref = {
    sourceId: 'synthetic-source',
    streamId: 42,
    name: 'Example News',
    country: 'US',
};
describe('device-local channel issue reports', () => {
    let values: Map<string, string>;
    let storage: { getItem: jest.Mock; setItem: jest.Mock };
    const create = () => {
        TestBed.configureTestingModule({
            providers: [{ provide: CHANNEL_ISSUE_STORAGE, useValue: storage }],
        });
        return TestBed.inject(ChannelIssuesService);
    };
    beforeEach(() => {
        jest.useFakeTimers();
        values = new Map();
        storage = {
            getItem: jest.fn((key) => values.get(key) ?? null),
            setItem: jest.fn((key, value) => values.set(key, value)),
        };
    });
    afterEach(() => {
        TestBed.resetTestingModule();
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    it('isolates server profiles with colliding source IDs and preserves legacy local reports', () => {
        const profile = jest
            .spyOn(connection, 'sourceProfileName')
            .mockReturnValue('iptvnator');
        let service = create();
        service.report(ref, 'image-error');
        jest.advanceTimersByTime(300);
        const legacy = values.get('channel-issues-v1');
        TestBed.resetTestingModule();

        profile.mockReturnValue('iptvnator-server:synthetic-a');
        service = create();
        expect(service.issues()).toEqual([]);
        service.report({ ...ref, name: 'Synthetic server A' }, 'empty-epg');
        // Even a delayed flush remains owned by the profile that created it.
        profile.mockReturnValue('iptvnator-server:synthetic-b');
        jest.advanceTimersByTime(300);
        expect(
            values.get('iptvnator-server:synthetic-a:channel-issues-v1')
        ).toContain('Synthetic server A');
        TestBed.resetTestingModule();

        service = create();
        expect(service.issues()).toEqual([]);
        service.resolve(ref, 'epg');
        TestBed.resetTestingModule();

        profile.mockReturnValue('iptvnator-server:synthetic-a');
        service = create();
        expect(service.issues()[0].name).toBe('Synthetic server A');
        TestBed.resetTestingModule();

        profile.mockReturnValue('iptvnator');
        service = create();
        expect(service.issues()).toMatchObject([
            { ...ref, reason: 'image-error' },
        ]);
        expect(values.get('channel-issues-v1')).toBe(legacy);
    });
    it('deduplicates repeated logo observations and keeps EPG and source identities separate', () => {
        const service = create();
        service.report(ref, 'missing-url');
        service.report(ref, 'image-error');
        service.report(ref, 'image-error');
        service.report(ref, 'empty-epg');
        service.report({ ...ref, sourceId: 'second-source' }, 'missing-url');
        expect(service.issues()).toHaveLength(3);
        service.resolve(ref, 'logo');
        expect(service.issues().map((i) => [i.sourceId, i.kind])).toEqual([
            ['synthetic-source', 'epg'],
            ['second-source', 'logo'],
        ]);
    });
    it('flushes a pending observation on pagehide before the debounce expires', () => {
        const service = create();
        service.report(ref, 'missing-url');
        expect(storage.setItem).not.toHaveBeenCalled();
        window.dispatchEvent(new Event('pagehide'));
        expect(storage.setItem).toHaveBeenCalledWith(
            'channel-issues-v1',
            expect.stringContaining('missing-url')
        );
        const writes = storage.setItem.mock.calls.length;
        jest.advanceTimersByTime(300);
        expect(storage.setItem).toHaveBeenCalledTimes(writes);
    });
    it('persists on this storage and restores across reload without copying unknown fields', () => {
        let service = create();
        service.report(
            {
                ...ref,
                password: 'synthetic-secret',
                imageUrl: 'https://example.test/logo',
            } as typeof ref,
            'image-error'
        );
        jest.advanceTimersByTime(300);
        TestBed.resetTestingModule();
        service = create();
        expect(service.issues()).toHaveLength(1);
        expect(service.exportJson()).not.toContain('synthetic-secret');
        expect(service.exportJson()).not.toContain('example.test');
        expect(JSON.parse(service.exportJson())).toMatchObject({
            schemaVersion: 1,
            issues: [{ ...ref, reason: 'image-error', kind: 'logo' }],
        });
    });
    it('keeps first observation and advances last observation without rewriting on every render', () => {
        const service = create();
        service.report(ref, 'empty-epg');
        const first = service.issues()[0].firstSeen;
        jest.advanceTimersByTime(61_000);
        service.report(ref, 'epg-error');
        expect(service.issues()[0].firstSeen).toBe(first);
        expect(service.issues()[0].lastSeen).toBeGreaterThan(first);
        service.resolve(ref, 'epg');
        expect(service.issues()).toEqual([]);
    });
    it('survives denied storage and leaves the in-memory report exportable', () => {
        storage.getItem.mockImplementation(() => {
            throw new Error('denied');
        });
        storage.setItem.mockImplementation(() => {
            throw new Error('quota');
        });
        const service = create();
        service.report(ref, 'image-error');
        jest.advanceTimersByTime(300);
        expect(service.storageFailed()).toBe(true);
        expect(JSON.parse(service.exportJson()).issues).toHaveLength(1);
    });
    it('rejects malformed saved data and caps retained issues', () => {
        values.set('channel-issues-v1', JSON.stringify([{ sourceId: 'bad' }]));
        const service = create();
        expect(service.issues()).toEqual([]);
        for (let streamId = 0; streamId < 5001; streamId++)
            service.report({ ...ref, streamId }, 'missing-url');
        expect(service.issues()).toHaveLength(5000);
        expect(service.issues()[0].streamId).toBe(1);
    });
});

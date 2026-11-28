import { TestBed } from '@angular/core/testing';
import { EpgSourceSettingsService } from '@iptvnator/services';
import {
    DiscoveryBaseline,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { DiscoveryMappingStorage } from './discovery-mapping-storage.service';

/** Exercise commit/abort ordering; the Electron baseline flow uses real IndexedDB. */
describe('Dictionary baseline EPG invalidation', () => {
    const baseline: DiscoveryBaseline = {
        sourceId: 'synthetic-source',
        version: 1,
        rows: [
            {
                id: 'local:synthetic-source:live:7',
                name: 'Synthetic News',
                categories: [],
                provider: {
                    source_id: 'synthetic-source',
                    stream_id: 7,
                    name: 'Synthetic News',
                },
                country: '',
                category: '',
                language: '',
                status: 'unclassified',
                origin: 'manual',
                ruleVersion: 1,
                epg: { xmltvId: 'SyntheticNews.example' },
            },
        ],
    };
    type Request = { result?: unknown; onsuccess?: () => void };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    afterEach(() => {
        if (original) Object.defineProperty(globalThis, 'indexedDB', original);
        else Reflect.deleteProperty(globalThis, 'indexedDB');
    });
    function setup(
        receipt?: unknown,
        current?: unknown,
        merge?: (saved: ClassifiedStream[]) => ClassifiedStream[]
    ) {
        const invalidateLookups = jest.fn();
        const requests: Request[] = [];
        const put = jest.fn();
        const store = {
            get: jest.fn(() => {
                const request = {};
                requests.push(request);
                return request;
            }),
            put,
        };
        const tx = {
            objectStore: () => store,
            abort: jest.fn((): void => {
                tx.onabort?.();
            }),
            oncomplete: undefined as (() => void) | undefined,
            onabort: undefined as (() => void) | undefined,
        };
        const db = { transaction: () => tx, close: jest.fn() };
        const open = {
            result: db,
            onsuccess: undefined as (() => void) | undefined,
        };
        Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: { open: () => open },
        });
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: EpgSourceSettingsService,
                    useValue: { invalidateLookups },
                },
            ],
        });
        const storage = TestBed.inject(DiscoveryMappingStorage);
        const pending = merge
            ? storage.update(baseline.sourceId, merge)
            : storage.applyBaseline(baseline);
        open.onsuccess?.();
        requests[0].result = merge ? current : receipt;
        requests[0].onsuccess?.();
        if (requests[1]) {
            requests[1].result = current;
            requests[1].onsuccess?.();
        }
        return { pending, tx, put, invalidateLookups };
    }
    it('invalidates only after a new dictionary baseline transaction commits', async () => {
        const { pending, tx, put, invalidateLookups } = setup();
        expect(put).toHaveBeenCalledTimes(3);
        expect(invalidateLookups).not.toHaveBeenCalled();
        tx.oncomplete?.();
        await pending;
        expect(invalidateLookups).toHaveBeenCalledTimes(1);
    });
    it('does not invalidate when the same baseline receipt is replayed', async () => {
        const { pending, tx, put, invalidateLookups } = setup({ version: 1 });
        tx.oncomplete?.();
        await pending;
        expect(put).not.toHaveBeenCalled();
        expect(invalidateLookups).not.toHaveBeenCalled();
    });
    it('does not invalidate when corrupt existing data aborts the transaction', async () => {
        const { pending, tx, invalidateLookups } = setup(undefined, [
            { invalid: true },
        ]);
        await expect(pending).rejects.toThrow('previous data retained');
        expect(tx.abort).toHaveBeenCalled();
        expect(invalidateLookups).not.toHaveBeenCalled();
    });
    it('merges a refreshed dictionary against the transaction-current mappings and invalidates after commit', async () => {
        const existing = {
            ...baseline.rows[0],
            name: 'Synthetic current edit',
        };
        const merge = jest.fn((rows: ClassifiedStream[]) => rows);
        const { pending, tx, put, invalidateLookups } = setup(
            undefined,
            [existing],
            merge
        );
        expect(merge).toHaveBeenCalledWith([existing]);
        expect(put).toHaveBeenCalledWith([existing], baseline.sourceId);
        expect(invalidateLookups).not.toHaveBeenCalled();
        tx.oncomplete?.();
        await pending;
        expect(invalidateLookups).toHaveBeenCalledTimes(1);
    });
    it('aborts a failed dictionary merge without invalidating the working mappings', async () => {
        const { pending, tx, put, invalidateLookups } = setup(
            undefined,
            baseline.rows,
            () => {
                throw new Error('synthetic merge failure');
            }
        );
        await expect(pending).rejects.toThrow();
        expect(tx.abort).toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(invalidateLookups).not.toHaveBeenCalled();
    });
});

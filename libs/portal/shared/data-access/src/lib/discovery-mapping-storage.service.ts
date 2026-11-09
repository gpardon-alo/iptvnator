import { Injectable } from '@angular/core';
import {
    assertDiscoveryMappings,
    mergeDiscoveryBaseline,
    parseDiscoveryBaseline,
    type DiscoveryBaseline,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { sourceProfileName } from '@iptvnator/services/source-sync/connection';

/** Device-local user mappings live independently of the expiring provider cache. */
@Injectable({ providedIn: 'root' })
export class DiscoveryMappingStorage {
    private async visit<T>(
        sourceId: string,
        rows?: ClassifiedStream[]
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const open = indexedDB.open(
                `${sourceProfileName()}:discovery-mappings-v1`,
                1
            );
            open.onupgradeneeded = () =>
                open.result.createObjectStore('sources');
            open.onerror = () =>
                reject(new Error('Cannot open classification storage'));
            open.onblocked = () =>
                reject(new Error('Classification storage is blocked'));
            open.onsuccess = () => {
                const db = open.result;
                db.onversionchange = () => db.close();
                try {
                    const tx = db.transaction(
                        'sources',
                        rows ? 'readwrite' : 'readonly'
                    );
                    const store = tx.objectStore('sources');
                    const request = rows
                        ? store.put(rows, sourceId)
                        : store.get(sourceId);
                    tx.oncomplete = () => {
                        db.close();
                        resolve(request.result as T);
                    };
                    tx.onabort = tx.onerror = () => {
                        db.close();
                        reject(new Error('Cannot save classifications'));
                    };
                } catch {
                    db.close();
                    reject(new Error('Classification storage unavailable'));
                }
            };
        });
    }
    async read(sourceId: string): Promise<ClassifiedStream[]> {
        const rows = await this.visit<unknown>(sourceId);
        if (rows === undefined) return [];
        assertDiscoveryMappings(rows, sourceId);
        return rows;
    }
    async write(sourceId: string, rows: ClassifiedStream[]): Promise<void> {
        assertDiscoveryMappings(rows, sourceId);
        await this.visit(sourceId, rows);
    }

    /** Receipt, rollback snapshot and merge commit atomically in the existing v1 store. */
    async applyBaseline(baseline: DiscoveryBaseline): Promise<void> {
        parseDiscoveryBaseline({ schemaVersion: 1, baselines: [baseline] });
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open(
                `${sourceProfileName()}:discovery-mappings-v1`,
                1
            );
            open.onupgradeneeded = () =>
                open.result.createObjectStore('sources');
            open.onerror = () =>
                reject(new Error('Cannot open classification storage'));
            open.onblocked = () =>
                reject(new Error('Classification storage is blocked'));
            open.onsuccess = () => {
                const db = open.result;
                db.onversionchange = () => db.close();
                try {
                    const tx = db.transaction('sources', 'readwrite');
                    const store = tx.objectStore('sources');
                    const receiptKey = ['baseline-receipt', baseline.sourceId];
                    const receipt = store.get(receiptKey);
                    receipt.onsuccess = () => {
                        const previous = receipt.result;
                        if (
                            previous !== undefined &&
                            (!Number.isSafeInteger(previous?.version) ||
                                previous?.version < 1)
                        ) {
                            tx.abort();
                            return;
                        }
                        if (previous?.version >= baseline.version) return;
                        const current = store.get(baseline.sourceId);
                        current.onsuccess = () => {
                            try {
                                const saved =
                                    current.result === undefined
                                        ? []
                                        : current.result;
                                assertDiscoveryMappings(
                                    saved,
                                    baseline.sourceId
                                );
                                store.put(saved, [
                                    'baseline-backup',
                                    baseline.sourceId,
                                    baseline.version,
                                ]);
                                store.put(
                                    mergeDiscoveryBaseline(saved, baseline),
                                    baseline.sourceId
                                );
                                store.put(
                                    {
                                        version: baseline.version,
                                        appliedAt: new Date().toISOString(),
                                    },
                                    receiptKey
                                );
                            } catch {
                                tx.abort();
                            }
                        };
                    };
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onabort = tx.onerror = () => {
                        db.close();
                        reject(
                            new Error(
                                'Could not import classification baseline; previous data retained'
                            )
                        );
                    };
                } catch {
                    db.close();
                    reject(new Error('Classification storage unavailable'));
                }
            };
        });
    }
}

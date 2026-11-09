/** Separate from user-owned favorites/history and never uploaded to a server. */
export function catalogStorage(profile: string) {
    async function visit<T>(
        mode: IDBTransactionMode,
        run: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const open = indexedDB.open(`${profile}:xtream-catalog-v1`, 1);
            open.onupgradeneeded = () =>
                open.result.createObjectStore('catalog');
            open.onerror = () => reject(open.error);
            open.onblocked = () => reject(new Error('Catalog storage blocked'));
            open.onsuccess = () => {
                const db = open.result;
                db.onversionchange = () => db.close();
                try {
                    const tx = db.transaction('catalog', mode);
                    const request = run(tx.objectStore('catalog'));
                    tx.oncomplete = () => {
                        db.close();
                        resolve(request.result);
                    };
                    tx.onabort = tx.onerror = () => {
                        db.close();
                        reject(tx.error);
                    };
                } catch (error) {
                    db.close();
                    reject(error);
                }
            };
        });
    }
    return {
        read: (key: string): Promise<unknown> =>
            visit('readonly', (s) => s.get(key)),
        write: (key: string, value: unknown, isCurrent: () => boolean) =>
            visit('readwrite', (s) =>
                isCurrent() ? s.put(value, key) : s.get(key)
            ),
        remove: (playlistId: string) =>
            typeof indexedDB === 'undefined'
                ? Promise.resolve()
                : visit('readwrite', (s) =>
                      s.delete(
                          IDBKeyRange.bound(
                              `${playlistId}:`,
                              `${playlistId}:\uffff`
                          )
                      )
                  ),
    };
}

/** Catalog failures affect every job; a broken individual image does not. */
export class LogoCatalogUnavailableError extends Error {
    constructor() {
        super('Logo catalog unavailable');
        this.name = 'LogoCatalogUnavailableError';
    }
}

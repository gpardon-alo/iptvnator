/** Provider failure still permits a backup; rethrow only when no source answers. */
export async function resolveEpgFallback<T>(args: {
    preferUploaded: boolean;
    fetchProvider: () => Promise<T[]>;
    fetchBackup: () => Promise<T[]>;
}): Promise<T[]> {
    if (args.preferUploaded) {
        const backup = await args.fetchBackup();
        if (backup.length) return backup;
        return args.fetchProvider();
    }
    let failure: unknown;
    let failed = false;
    try {
        const provider = await args.fetchProvider();
        if (provider.length) return provider;
    } catch (error) {
        failed = true;
        failure = error;
    }
    const backup = await args.fetchBackup();
    if (backup.length) return backup;
    if (failed) throw failure;
    return [];
}

import {
    ChannelLogoRunner,
    type LogoRunnerDependencies,
} from './channel-logo-runner';
import type {
    LogoJob,
    LogoRepairStatus,
} from '@iptvnator/shared/channel-enrichment';

const job: LogoJob = {
    sourceId: 'fixture-source',
    streamId: 1,
    revision: 'revision',
    title: 'US | Example',
    epgId: '',
    country: '',
    attempts: 1,
    lease: 'lease',
    hash: '',
};
const status: LogoRepairStatus = {
    enabled: true,
    running: false,
    pending: 1,
    repaired: 0,
    unresolved: 0,
    failed: 0,
    lastAudit: 0,
    error: '',
};
function setup() {
    const storage = jest.fn(async (request) => {
        if (request.action === 'status') return status;
        if (request.action === 'audit') return 0;
        if (request.action === 'claim')
            return storage.mock.calls.filter(([r]) => r.action === 'claim')
                .length === 1
                ? job
                : null;
        return null;
    });
    const resolve = jest
        .fn<
            ReturnType<LogoRunnerDependencies['resolve']>,
            Parameters<LogoRunnerDependencies['resolve']>
        >()
        .mockResolvedValue({ hash: 'hash', canonicalId: 'Example.us' });
    const runner = new ChannelLogoRunner({
        storage: storage as LogoRunnerDependencies['storage'],
        resolve,
        now: () => 1_000_000,
    });
    return { runner, storage, resolve };
}
describe('desktop logo maintenance scheduler', () => {
    it('audits once and deduplicates concurrent runs', async () => {
        const { runner, storage, resolve } = setup();
        await Promise.all([runner.run(), runner.run(), runner.run()]);
        expect(
            storage.mock.calls.filter(([r]) => r.action === 'audit')
        ).toHaveLength(1);
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(storage).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'finish', state: 'repaired' })
        );
    });
    it('leaves interrupted work recoverable and never applies a late result', async () => {
        const { runner, storage, resolve } = setup();
        let release!: () => void;
        const started = new Promise<void>((r) => {
            release = r;
        });
        let resolveJob!: (value: null) => void;
        resolve.mockImplementation(async (_job, signal) => {
            release();
            await new Promise<null>((r) => {
                resolveJob = r;
            });
            expect(signal.aborted).toBe(true);
            return null;
        });
        const run = runner.run();
        await started;
        runner.stop();
        resolveJob(null);
        await run;
        expect(storage.mock.calls.some(([r]) => r.action === 'finish')).toBe(
            false
        );
    });
    it('backs off an upstream failure instead of failing every queued channel', async () => {
        const { runner, storage, resolve } = setup();
        resolve.mockRejectedValue(new Error('Synthetic remote failure'));
        await runner.run();
        await runner.run();
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(storage).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'finish', state: 'failed' })
        );
        expect((await runner.status()).error).toBe('catalog');
    });
    it('abstains without generating another candidate or URL', async () => {
        const { runner, storage, resolve } = setup();
        resolve.mockResolvedValue(null);
        await runner.run();
        expect(storage).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'finish', state: 'unresolved' })
        );
    });
    it('does no work when disabled', async () => {
        const { runner, storage, resolve } = setup();
        storage.mockImplementation(async () => ({ ...status, enabled: false }));
        await runner.run(true);
        expect(storage).toHaveBeenCalledTimes(1);
        expect(resolve).not.toHaveBeenCalled();
    });
});

import { randomUUID } from 'node:crypto';
import { LogoCatalogUnavailableError } from './channel-logo-errors';
import { setImmediate as yieldToMain } from 'node:timers/promises';
import type {
    LogoJob,
    LogoRepairStatus,
    LogoStorageRequest,
} from '@iptvnator/shared/channel-enrichment';

export interface LogoRunnerDependencies {
    storage<T>(request: LogoStorageRequest): Promise<T>;
    resolve(
        job: LogoJob,
        signal: AbortSignal
    ): Promise<{ hash: string; canonicalId: string } | null>;
    now(): number;
}

/** One run per process; persisted leases cover interrupted work across processes. */
export class ChannelLogoRunner {
    private active: Promise<void> | null = null;
    private controller: AbortController | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private stopped = false;
    private forceAudit = false;
    private retryAt = 0;
    private error: LogoRepairStatus['error'] = '';

    constructor(private readonly deps: LogoRunnerDependencies) {}

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.run(), 15_000);
        this.timer.unref();
    }

    async status(): Promise<LogoRepairStatus> {
        const stored = await this.deps.storage<LogoRepairStatus>({
            action: 'status',
        });
        return { ...stored, running: !!this.active, error: this.error };
    }

    async enable(enabled: boolean): Promise<void> {
        if (!enabled) this.controller?.abort();
        await this.deps.storage({ action: 'enable', enabled });
        if (enabled) this.run(true);
    }

    run(audit = false): Promise<void> {
        this.forceAudit ||= audit;
        if (this.active || this.stopped)
            return this.active ?? Promise.resolve();
        this.active = this.execute()
            .catch(() => {
                this.error = 'storage';
            })
            .finally(() => {
                this.active = null;
                this.controller = null;
            });
        return this.active;
    }

    stop(): void {
        this.stopped = true;
        this.controller?.abort();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    private async execute(): Promise<void> {
        const status = await this.status();
        if (!status.enabled || this.stopped) return;
        if (!this.forceAudit && this.deps.now() < this.retryAt) return;
        const controller = new AbortController();
        this.retryAt = 0;
        this.controller = controller;
        this.error = '';
        if (
            this.forceAudit ||
            this.deps.now() - status.lastAudit >= 5 * 60_000
        ) {
            this.forceAudit = false;
            let after = 0;
            do {
                if (controller.signal.aborted || this.stopped) return;
                after = await this.deps.storage<number>({
                    action: 'audit',
                    after,
                    now: this.deps.now(),
                });
                await yieldToMain();
            } while (after);
        }
        for (
            let count = 0;
            count < 25 && !controller.signal.aborted && !this.stopped;
            count++
        ) {
            const job = await this.deps.storage<LogoJob | null>({
                action: 'claim',
                now: this.deps.now(),
                lease: randomUUID(),
            });
            if (!job) break;
            try {
                const result = await this.deps.resolve(job, controller.signal);
                if (controller.signal.aborted || this.stopped) return;
                await this.deps.storage({
                    action: 'finish',
                    job,
                    now: this.deps.now(),
                    state: result ? 'repaired' : 'unresolved',
                    ...result,
                });
            } catch (error) {
                if (controller.signal.aborted || this.stopped) return;
                await this.deps.storage({
                    action: 'finish',
                    job,
                    now: this.deps.now(),
                    state: 'failed',
                });
                if (error instanceof LogoCatalogUnavailableError) {
                    // Only shared catalog failures pause unrelated channels.
                    this.retryAt = this.deps.now() + 5 * 60_000;
                    this.error = 'catalog';
                    break;
                }
            }
            await yieldToMain();
        }
    }
}

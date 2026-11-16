import { ipcMain } from 'electron';
import { join } from 'node:path';
import { getIptvnatorDatabaseDirectory } from '@iptvnator/shared/database/path-utils';
import {
    validLogoRef,
    type LogoControl,
    type LogoLookup,
    type LogoResult,
    type LogoStorageRequest,
} from '@iptvnator/shared/channel-enrichment';
import { getDatabase } from '../database/connection';
import { databaseWorkerClient } from '../services/database-worker-client';
import { ChannelLogoRunner } from '../services/channel-logo-runner';
import { ChannelLogoCatalog } from '../services/channel-logo-catalog';
import { ChannelLogoImages } from '../services/channel-logo-images';

let runner: ChannelLogoRunner | null = null;

export function registerChannelLogoEvents(): void {
    const root = join(getIptvnatorDatabaseDirectory(), '..', 'channel-logos');
    const catalog = new ChannelLogoCatalog(root);
    const images = new ChannelLogoImages(join(root, 'images'));
    const storage = async <T>(request: LogoStorageRequest): Promise<T> => {
        await getDatabase();
        return databaseWorkerClient.request<T>('DB_CHANNEL_LOGOS', request);
    };
    const worker = new ChannelLogoRunner({
        storage,
        now: Date.now,
        resolve: async (job, signal) => {
            const index = await catalog.get(signal);
            const match = index.match(job.title, job.epgId, job.country);
            if (!match?.url) return null;
            return {
                hash: await images.download(match.url, signal),
                canonicalId: match.id,
            };
        },
    });
    runner = worker;
    ipcMain.handle(
        'CHANNEL_LOGOS_CONTROL',
        async (_event, request: LogoControl) => {
            if (
                !request ||
                !['status', 'enable', 'run', 'pause'].includes(request.action)
            )
                throw new Error('Invalid logo command');
            if (request.action === 'enable') {
                if (typeof request.enabled !== 'boolean')
                    throw new Error('Invalid logo setting');
                await worker.enable(request.enabled);
            }
            if (request.action === 'pause') await worker.enable(false);
            if (request.action === 'run') void worker.run(true);
            return worker.status();
        }
    );
    ipcMain.handle(
        'CHANNEL_LOGOS_LOOKUP',
        async (_event, refs: LogoLookup[]) => {
            if (
                !Array.isArray(refs) ||
                refs.length > 50 ||
                !refs.every(
                    (ref) =>
                        validLogoRef(ref) &&
                        (ref.country === undefined ||
                            (typeof ref.country === 'string' &&
                                /^[A-Z]{2}$/.test(ref.country))) &&
                        (ref.knownHash === undefined ||
                            (typeof ref.knownHash === 'string' &&
                                /^[a-f0-9]{64}$/.test(ref.knownHash)))
                )
            )
                throw new Error('Invalid logo lookup');
            const results = await storage<LogoResult[]>({
                action: 'lookup',
                refs,
                now: Date.now(),
            });
            const output: LogoResult[] = [];
            for (const result of results) {
                const known = refs.find(
                    (ref) =>
                        ref.sourceId === result.sourceId &&
                        ref.streamId === result.streamId
                )?.knownHash;
                try {
                    if (known === result.hash) output.push(result);
                    else
                        output.push({
                            ...result,
                            dataUrl: `data:image/png;base64,${(await images.read(result.hash)).toString('base64')}`,
                        });
                } catch {
                    await storage({
                        action: 'retry',
                        ref: result,
                        now: Date.now(),
                    });
                }
            }
            void worker.run();
            return output;
        }
    );
    worker.start();
}

export function stopChannelLogoJobs(): void {
    runner?.stop();
    runner = null;
}

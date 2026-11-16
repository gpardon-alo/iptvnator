export interface ChannelLogoRef {
    sourceId: string;
    streamId: number;
}

export interface LogoLookup extends ChannelLogoRef {
    knownHash?: string;
    country?: string;
}

export interface LogoResult extends ChannelLogoRef {
    hash: string;
    dataUrl?: string;
}

export interface LogoRepairStatus {
    enabled: boolean;
    running: boolean;
    pending: number;
    repaired: number;
    unresolved: number;
    failed: number;
    lastAudit: number;
    error: '' | 'catalog' | 'storage';
}

export type LogoControl =
    | { action: 'status' }
    | { action: 'enable'; enabled: boolean }
    | { action: 'run' }
    | { action: 'pause' };

export interface LogoJob extends ChannelLogoRef {
    revision: string;
    title: string;
    epgId: string;
    country: string;
    attempts: number;
    lease: string;
    hash: string;
}

export interface LogoCandidate {
    id: string;
    country: string;
    names: string[];
    url: string;
}

export type LogoJobState =
    'pending' | 'running' | 'repaired' | 'unresolved' | 'failed';

/** Main/worker-only protocol; never exposed as a generic renderer command. */
export type LogoStorageRequest =
    | { action: 'status' }
    | { action: 'enable'; enabled: boolean }
    | { action: 'audit'; after: number; now: number }
    | { action: 'lookup'; refs: LogoLookup[]; now: number }
    | { action: 'claim'; now: number; lease: string }
    | {
          action: 'finish';
          job: LogoJob;
          now: number;
          state: Exclude<LogoJobState, 'pending' | 'running'>;
          hash?: string;
          canonicalId?: string;
      }
    | { action: 'retry'; ref: ChannelLogoRef; now: number };

export function validLogoRef(value: unknown): value is ChannelLogoRef {
    if (!value || typeof value !== 'object') return false;
    const ref = value as ChannelLogoRef;
    return (
        typeof ref.sourceId === 'string' &&
        ref.sourceId.length > 0 &&
        ref.sourceId.length <= 200 &&
        Number.isSafeInteger(ref.streamId) &&
        ref.streamId > 0
    );
}

export const LOGO_DAY = 86_400_000;
export function logoRetryDelay(state: LogoJobState, attempts: number): number {
    if (state === 'repaired') return 30 * LOGO_DAY;
    if (state === 'unresolved') return 7 * LOGO_DAY;
    return Math.min(
        LOGO_DAY,
        60_000 * 2 ** Math.min(11, Math.max(0, attempts - 1))
    );
}

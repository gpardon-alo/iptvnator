import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
    logoRetryDelay,
    type ChannelLogoRef,
    type LogoJob,
    type LogoStorageRequest,
} from '@iptvnator/shared/channel-enrichment';

const initialized = new WeakSet<object>();
const sourceSql = `SELECT c.id, c.title, c.epg_channel_id AS epgId,
    c.poster_url AS poster, c.xtream_id AS streamId, p.id AS sourceId,
    p.date_created AS created, p.serverUrl AS server, p.username, p.password
    FROM content c JOIN categories g ON g.id=c.category_id
    JOIN playlists p ON p.id=g.playlist_id WHERE p.type='xtream' AND c.type='live'
    AND CASE WHEN json_valid(p.payload) THEN CASE
        WHEN json_type(p.payload,'$.xtreamContentTypes')='array' THEN EXISTS(
            SELECT 1 FROM json_each(p.payload,'$.xtreamContentTypes') WHERE value='live')
        ELSE 1 END ELSE 1 END`;
interface SourceRow extends ChannelLogoRef {
    id: number;
    title: string;
    epgId: string | null;
    poster: string | null;
    created: string | null;
    server: string | null;
    username: string | null;
    password: string | null;
}
interface StoredJob extends LogoJob {
    state: string;
    due: number;
}

export function initializeLogoStorage(db: Database.Database): void {
    if (initialized.has(db)) return;
    db.exec(`CREATE TABLE IF NOT EXISTS channel_logo_settings (
        id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
        last_audit INTEGER NOT NULL DEFAULT 0);
        INSERT OR IGNORE INTO channel_logo_settings(id) VALUES(1);
        CREATE TABLE IF NOT EXISTS channel_logo_jobs (
        sourceId TEXT NOT NULL, streamId INTEGER NOT NULL, revision TEXT NOT NULL,
        title TEXT NOT NULL, epgId TEXT NOT NULL, country TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'pending', due INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0, lease TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT '', canonicalId TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(sourceId,streamId));
        CREATE INDEX IF NOT EXISTS idx_channel_logo_due ON channel_logo_jobs(due);`);
    initialized.add(db);
}

function current(
    db: Database.Database,
    ref: ChannelLogoRef
): SourceRow | undefined {
    return db
        .prepare(
            `${sourceSql} AND p.id=? AND c.xtream_id=? ORDER BY c.id LIMIT 1`
        )
        .get(ref.sourceId, ref.streamId) as SourceRow | undefined;
}

function revision(row: SourceRow): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                row.id,
                row.created,
                row.title,
                row.epgId,
                row.poster,
                row.server,
                row.username,
                row.password,
            ])
        )
        .digest('hex');
}

function enqueue(db: Database.Database, row: SourceRow, country = ''): void {
    db.prepare(
        `INSERT INTO channel_logo_jobs(sourceId,streamId,revision,title,epgId,country)
        VALUES(?,?,?,?,?,?) ON CONFLICT(sourceId,streamId) DO UPDATE SET
        revision=excluded.revision,title=excluded.title,epgId=excluded.epgId,
        country=CASE WHEN excluded.country='' THEN channel_logo_jobs.country ELSE excluded.country END,
        state='pending',due=0,attempts=0,lease='',hash='',canonicalId=''
        WHERE revision!=excluded.revision OR (excluded.country!='' AND country!=excluded.country)`
    ).run(
        row.sourceId,
        row.streamId,
        revision(row),
        row.title,
        row.epgId ?? '',
        country
    );
}

export function channelLogoOperation(
    db: Database.Database,
    request: LogoStorageRequest
): unknown {
    initializeLogoStorage(db);
    const settings = db
        .prepare('SELECT * FROM channel_logo_settings WHERE id=1')
        .get() as { enabled: number; last_audit: number };
    if (request.action === 'enable') {
        db.transaction(() => {
            db.prepare(
                'UPDATE channel_logo_settings SET enabled=? WHERE id=1'
            ).run(Number(request.enabled));
            if (!request.enabled) {
                // Normal cancellation releases ownership; only crashes wait for lease expiry.
                db.prepare(
                    "UPDATE channel_logo_jobs SET state='pending',due=0,lease='' WHERE state='running'"
                ).run();
            }
        })();
        return null;
    }
    if (request.action === 'status') {
        const counts = db
            .prepare(
                'SELECT state,COUNT(*) AS n FROM channel_logo_jobs GROUP BY state'
            )
            .all() as { state: string; n: number }[];
        const count = (state: string) =>
            counts.find((row) => row.state === state)?.n ?? 0;
        return {
            enabled: !!settings.enabled,
            pending: count('pending') + count('running'),
            repaired: count('repaired'),
            unresolved: count('unresolved'),
            failed: count('failed'),
            lastAudit: settings.last_audit,
        };
    }
    if (!settings.enabled) return request.action === 'lookup' ? [] : null;

    if (request.action === 'audit') {
        const rows = db
            .prepare(`${sourceSql} AND c.id>? ORDER BY c.id LIMIT 300`)
            .all(request.after) as SourceRow[];
        db.transaction(() => {
            for (const row of rows) {
                const existing = db
                    .prepare(
                        'SELECT 1 FROM channel_logo_jobs WHERE sourceId=? AND streamId=?'
                    )
                    .get(row.sourceId, row.streamId);
                // Duplicate category rows share one stream; use its canonical first row.
                if (!row.poster?.trim() || existing) {
                    const canonical = current(db, row);
                    if (canonical) enqueue(db, canonical);
                }
            }
            if (rows.length < 300) {
                db.prepare(
                    `DELETE FROM channel_logo_jobs WHERE NOT EXISTS (
                    SELECT 1 FROM content c JOIN categories g ON g.id=c.category_id
                    JOIN playlists p ON p.id=g.playlist_id WHERE p.id=sourceId
                    AND c.xtream_id=streamId AND c.type='live' AND p.type='xtream')`
                ).run();
                db.prepare(
                    'UPDATE channel_logo_settings SET last_audit=? WHERE id=1'
                ).run(request.now);
            }
        })();
        return rows.length === 300 ? rows[rows.length - 1].id : 0;
    }
    if (request.action === 'lookup') {
        return db.transaction(() =>
            request.refs.flatMap((ref) => {
                const row = current(db, ref);
                if (!row) return [];
                enqueue(db, row, ref.country ?? '');
                const job = db
                    .prepare(
                        'SELECT * FROM channel_logo_jobs WHERE sourceId=? AND streamId=?'
                    )
                    .get(ref.sourceId, ref.streamId) as StoredJob;
                return job.hash ? [{ ...ref, hash: job.hash }] : [];
            })
        )();
    }
    if (request.action === 'retry') {
        db.prepare(
            `UPDATE channel_logo_jobs SET due=?, state='pending',hash='',lease=''
            WHERE sourceId=? AND streamId=?`
        ).run(request.now, request.ref.sourceId, request.ref.streamId);
        return null;
    }
    if (request.action === 'claim') {
        return db.transaction(() => {
            // A backward wall-clock adjustment cannot strand an interrupted lease.
            db.prepare(
                "UPDATE channel_logo_jobs SET due=? WHERE state='running' AND due>?"
            ).run(request.now, request.now + 120_000);
            const job = db
                .prepare(
                    'SELECT * FROM channel_logo_jobs WHERE due<=? ORDER BY due,sourceId,streamId LIMIT 1'
                )
                .get(request.now) as StoredJob | undefined;
            if (!job) return null;
            const row = current(db, job);
            if (!row || revision(row) !== job.revision) {
                db.prepare(
                    'DELETE FROM channel_logo_jobs WHERE sourceId=? AND streamId=?'
                ).run(job.sourceId, job.streamId);
                return null;
            }
            db.prepare(
                `UPDATE channel_logo_jobs SET state='running',lease=?,due=?,attempts=attempts+1
                WHERE sourceId=? AND streamId=?`
            ).run(
                request.lease,
                request.now + 120_000,
                job.sourceId,
                job.streamId
            );
            return { ...job, lease: request.lease, attempts: job.attempts + 1 };
        })();
    }
    const { job } = request;
    const row = current(db, job);
    if (!row || revision(row) !== job.revision) return false;
    const result = db
        .prepare(
            `UPDATE channel_logo_jobs SET state=?,due=?,lease='',hash=?,canonicalId=?
        WHERE sourceId=? AND streamId=? AND revision=? AND lease=?`
        )
        .run(
            request.state,
            request.now + logoRetryDelay(request.state, job.attempts),
            request.hash ?? job.hash,
            request.canonicalId ?? '',
            job.sourceId,
            job.streamId,
            job.revision,
            job.lease
        );
    return result.changes === 1;
}

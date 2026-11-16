import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import {
    channelLogoOperation,
    initializeLogoStorage,
} from '../channel-logo.operations';
import type {
    LogoJob,
    LogoStorageRequest,
} from '@iptvnator/shared/channel-enrichment';
import { __databaseConnectionTestHooks as hooks } from '@iptvnator/shared/database';

const file = join(process.env['IPTVNATOR_E2E_DATA_DIR']!, 'historical.db');
let db = new Database(file);
// Real historical table definitions, before the app's additive column migrations.
for (const statement of hooks.createTableStatements) db.exec(statement);
for (const statement of hooks.columnMigrationStatements) {
    try {
        db.exec(statement);
    } catch (error) {
        if (!String(error).includes('duplicate column name')) throw error;
    }
}
db.prepare(
    "INSERT INTO playlists(id,name,type,date_created) VALUES('fixture-source','Fixture source','xtream','2025-01-01')"
).run();
db.prepare(
    "INSERT INTO categories(id,playlist_id,name,type,xtream_id) VALUES(1,'fixture-source','Fixture','live',1)"
).run();
db.prepare(
    "INSERT INTO content(id,category_id,title,xtream_id,type) VALUES(1,1,'US | Example News HD',101,'live')"
).run();
const ref = { sourceId: 'fixture-source', streamId: 101 };
const run = (request: LogoStorageRequest) => channelLogoOperation(db, request);
const audit = () => run({ action: 'audit', after: 0, now: 1000 });
initializeLogoStorage(db);
initializeLogoStorage(db);
assert.equal(run({ action: 'claim', now: 1000, lease: 'off' }), null);
run({ action: 'enable', enabled: true });
audit();
audit();
assert.equal(
    (
        db.prepare('SELECT COUNT(*) AS n FROM channel_logo_jobs').get() as {
            n: number;
        }
    ).n,
    1
);
const first = run({ action: 'claim', now: 1000, lease: 'first' }) as LogoJob;
assert.equal(run({ action: 'claim', now: 1001, lease: 'duplicate' }), null);
// App termination leaves a lease; reopening preserves the queue and all catalog rows.
db.close();
db = new Database(file);
initializeLogoStorage(db);
assert.equal(run({ action: 'claim', now: 1001, lease: 'early' }), null);
const recovered = run({
    action: 'claim',
    now: 122000,
    lease: 'recovered',
}) as LogoJob;
assert.equal(recovered.attempts, 2);
assert.equal(
    run({
        action: 'finish',
        job: first,
        now: 122001,
        state: 'repaired',
        hash: 'stale',
    }),
    false
);
assert.equal(
    run({
        action: 'finish',
        job: recovered,
        now: 122001,
        state: 'repaired',
        hash: 'a'.repeat(64),
        canonicalId: 'ExampleNews.us',
    }),
    true
);
const lookup = run({ action: 'lookup', refs: [ref], now: 123000 }) as {
    hash: string;
}[];
assert.equal(lookup[0].hash, 'a'.repeat(64));
assert.equal(run({ action: 'claim', now: 123000, lease: 'not-due' }), null);
// Duplicate category appearances share one job and one stable canonical row.
db.prepare(
    "INSERT INTO categories(id,playlist_id,name,type,xtream_id) VALUES(2,'fixture-source','Fixture duplicate','live',2)"
).run();
db.prepare(
    "INSERT INTO content(id,category_id,title,xtream_id,type) VALUES(2,2,'Duplicate provider title',101,'live')"
).run();
audit();
assert.equal(
    (
        run({ action: 'lookup', refs: [ref], now: 123000 }) as {
            hash: string;
        }[]
    )[0].hash,
    'a'.repeat(64)
);
// New provider metadata invalidates the old repair; late completion cannot restore it.
db.prepare("UPDATE content SET title='CA | Example News HD' WHERE id=1").run();
audit();
assert.deepEqual(run({ action: 'lookup', refs: [ref], now: 124000 }), []);
assert.equal(
    run({
        action: 'finish',
        job: recovered,
        now: 124000,
        state: 'repaired',
        hash: 'b'.repeat(64),
    }),
    false
);
const updated = run({
    action: 'claim',
    now: 124000,
    lease: 'updated',
}) as LogoJob;
run({ action: 'enable', enabled: false });
assert.equal(
    run({ action: 'finish', job: updated, now: 124001, state: 'repaired' }),
    null
);
assert.deepEqual(run({ action: 'lookup', refs: [ref], now: 124000 }), []);
run({ action: 'enable', enabled: true });
db.prepare('DELETE FROM content').run();
audit();
assert.equal(
    (
        db.prepare('SELECT COUNT(*) AS n FROM channel_logo_jobs').get() as {
            n: number;
        }
    ).n,
    0
);
assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM playlists').get() as { n: number })
        .n,
    1
);
assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number })
        .n,
    2
);
// Bounded audits also cover a large catalog without returning provider payloads.
const insert = db.prepare(
    "INSERT INTO content(category_id,title,xtream_id,type) VALUES(1,? ,?,'live')"
);
db.transaction(() => {
    for (let i = 1; i <= 5001; i++) insert.run(`US | Example Channel ${i}`, i);
})();
let cursor = 0;
let chunks = 0;
do {
    cursor = run({ action: 'audit', after: cursor, now: 200_000 }) as number;
    chunks++;
} while (cursor);
assert.equal(chunks, 17);
assert.equal(
    (
        db.prepare('SELECT COUNT(*) AS n FROM channel_logo_jobs').get() as {
            n: number;
        }
    ).n,
    5001
);
db.prepare(`UPDATE playlists SET payload='{"xtreamContentTypes":[]}'`).run();
assert.deepEqual(run({ action: 'lookup', refs: [ref], now: 201_000 }), []);
db.close();
process.stdout.write('logo storage verified');

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it.each(['country', 'resume', 'refresh', 'artwork', 'retry'])(
    'preserves historical SQLite and logo job %s state across restart and catalog replacement',
    (scenario) => {
        const dataDir = mkdtempSync(join(tmpdir(), 'iptvnator-logo-test-'));
        try {
            expect(
                execFileSync(
                    createRequire(__filename)('electron'),
                    [
                        '--import',
                        'tsx',
                        resolve(__dirname, 'testing/channel-logo-storage.ts'),
                        scenario,
                    ],
                    {
                        cwd: process.cwd(),
                        encoding: 'utf8',
                        timeout: 30_000,
                        env: {
                            ...process.env,
                            ELECTRON_RUN_AS_NODE: '1',
                            IPTVNATOR_E2E_DATA_DIR: dataDir,
                            TSX_TSCONFIG_PATH: resolve('tsconfig.base.json'),
                        },
                    }
                )
            ).toBe('logo storage verified');
        } finally {
            rmSync(dataDir, { recursive: true, force: true });
        }
    },
    35_000
);

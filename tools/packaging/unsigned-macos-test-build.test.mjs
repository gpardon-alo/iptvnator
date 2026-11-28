import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { parse } = require('yaml');
const workflow = parse(
    fs.readFileSync(
        new URL('../../.github/workflows/build-and-make.yaml', import.meta.url),
        'utf8'
    )
);
const build = workflow.jobs['build-cross-platform'];

function unsigned(event, ref, requested) {
    const expression = build.env.UNSIGNED_MACOS.slice(3, -2);
    return vm.runInNewContext(expression, {
        github: { event_name: event, ref },
        inputs: { unsigned_macos: requested },
        startsWith: (value, prefix) => value.startsWith(prefix),
    });
}

test('unsigned macOS packages require an explicit manual test branch run', () => {
    assert.equal(
        workflow.on.workflow_dispatch.inputs.unsigned_macos.default,
        false
    );
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
        for (const ref of [
            'refs/heads/master',
            'refs/tags/v1.2.3',
            'refs/heads/test-build',
        ]) {
            for (const requested of [false, true]) {
                assert.equal(
                    unsigned(event, ref, requested),
                    event === 'workflow_dispatch' &&
                        ref === 'refs/heads/test-build' &&
                        requested,
                    `${event} ${ref} requested=${requested}`
                );
            }
        }
    }
});

test('unsigned configuration changes only the generated test package', () => {
    const step = build.steps.find(
        (step) => step.name === 'Configure unsigned macOS test package'
    );
    const script = step.run.match(/<<'NODE'\n([\s\S]*?)\nNODE/)[1];
    const original = fs.readFileSync(
        new URL('../../electron-builder.json', import.meta.url),
        'utf8'
    );
    let output;
    vm.runInNewContext(script, {
        require: () => ({
            readFileSync: () => original,
            writeFileSync: (_path, value) => {
                output = value;
            },
        }),
    });
    const config = JSON.parse(output);
    assert.equal(config.mac.identity, null);
    assert.equal(config.mac.forceCodeSigning, false);
    assert.equal(config.mac.notarize, false);
    const stable = JSON.parse(original);
    assert.equal(stable.mac.forceCodeSigning, true);
    assert.equal(stable.mac.notarize, true);
    assert.deepEqual(config.mac.target, stable.mac.target);
});

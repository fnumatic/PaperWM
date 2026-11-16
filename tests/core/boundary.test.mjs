import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const forbidden = [
    /from\s+['"]gi:\/\//,
    /from\s+['"]resource:\/\//,
    /from\s+['"]node:/,
    /from\s+['"]\.\.?\/imports\.js['"]/,
    /\bglobal\./,
    /\bGObject\./,
    /\bMeta\./,
    /\bClutter\./,
    /\bSt\./,
    /\bMain\./,
    /\bimports\b/,
    /\b(?:globalThis|Date|performance|console)\b/,
    /\bMath\.random\b/,
    /\b(?:setTimeout|setInterval|clearTimeout|clearInterval)\b/,
    /\bimport\s*\(/,
];

async function jsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory())
            files.push(...await jsFiles(path));
        else if (entry.name.endsWith('.js'))
            files.push(path);
    }
    return files;
}

/* Comments may name forbidden APIs while explaining the boundary. */
const stripComments = source => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

function checkSource(file, source, coreFiles) {
    source = stripComments(source);
    for (const pattern of forbidden)
        assert.doesNotMatch(source, pattern, `${file} matches ${pattern}`);

    // Resolve both normal and side-effect imports; transitive imports stay in core.
    for (const [, specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
        assert.ok(specifier.startsWith('.'), `external core dependency: ${specifier}`);
        assert.ok(coreFiles.has(resolve(dirname(file), specifier)),
            `dependency outside core: ${specifier}`);
    }
}

test('core modules stay free of shell, GI, Node and barrel imports', async () => {
    const files = await jsFiles(join(root, 'core'));
    assert.ok(files.length > 0, 'core must contain JavaScript modules');
    const coreFiles = new Set(files);

    for (const file of files)
        checkSource(file, await readFile(file, 'utf8'), coreFiles);
});

test('boundary check rejects ambient effects and imports outside core', () => {
    const file = join(root, 'core', 'example.js');
    for (const source of [
        "import 'gi://Meta';",
        "export { x } from '../utils.js';",
        "import { readFile } from 'node:fs';",
        "import('./hidden.js');",
        'Date.now();',
        'Math.random();',
        'globalThis.display;',
        'setTimeout(() => {}, 0);',
        'console.log("side effect");',
    ]) {
        assert.throws(() => checkSource(file, source, new Set()), { name: 'AssertionError' });
    }
    checkSource(file, "import { x } from './leaf.js';",
        new Set([join(root, 'core', 'leaf.js')]));
});

test('core modules are ES modules with explicit local imports', async () => {
    for (const file of await jsFiles(join(root, 'core'))) {
        const source = stripComments(await readFile(file, 'utf8'));
        for (const [, specifier] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))
            assert.match(specifier, /\.js$/, `${file} imports ${specifier}`);
    }
});

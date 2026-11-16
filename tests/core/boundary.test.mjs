import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

test('core modules stay free of shell, GI, Node and barrel imports', async () => {
    const files = await jsFiles(join(root, 'core'));
    assert.ok(files.length > 0, 'core must contain JavaScript modules');

    for (const file of files) {
        const source = stripComments(await readFile(file, 'utf8'));
        for (const pattern of forbidden) {
            assert.doesNotMatch(source, pattern, `${file} matches ${pattern}`);
        }
    }
});

test('core modules are ES modules with explicit local imports', async () => {
    for (const file of await jsFiles(join(root, 'core'))) {
        const source = stripComments(await readFile(file, 'utf8'));
        for (const [, specifier] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))
            assert.match(specifier, /\.js$/, `${file} imports ${specifier}`);
    }
});

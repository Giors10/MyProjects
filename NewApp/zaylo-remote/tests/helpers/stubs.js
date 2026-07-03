'use strict';

/**
 * Minimal browser-environment stubs so the plain-script PWA modules
 * (blind-sync.js, blind-schema.js, mqtt.js) can run under `node --test`.
 *
 * The scripts attach themselves to `window`; we point `window` at globalThis
 * so their exports (BlindCommandQueue, BlindSchema, ...) become directly
 * reachable from tests, and we back `localStorage` with a Map that tests can
 * reset between cases.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class LocalStorageStub {
    constructor() { this._map = new Map(); }
    getItem(key) { return this._map.has(key) ? this._map.get(key) : null; }
    setItem(key, value) { this._map.set(String(key), String(value)); }
    removeItem(key) { this._map.delete(String(key)); }
    clear() { this._map.clear(); }
    get length() { return this._map.size; }
    key(i) { return Array.from(this._map.keys())[i] ?? null; }
}

function installBrowserStubs() {
    const storage = new LocalStorageStub();
    global.localStorage = storage;
    global.window = globalThis;
    global.window.DEBUG = false;
    if (!global.window.location) {
        global.window.location = { protocol: 'http:', href: 'http://localhost/' };
    }
    global.document = {
        addEventListener() {},
        removeEventListener() {},
        visibilityState: 'visible',
        getElementById() { return null; },
        querySelector() { return null; }
    };
    // Pending retry timers (e.g. BlindCommandQueue's flush backoff) must not
    // keep the test process alive.
    const realSetTimeout = setTimeout;
    global.setTimeout = (fn, ms, ...args) => {
        const t = realSetTimeout(fn, ms, ...args);
        if (typeof t.unref === 'function') t.unref();
        return t;
    };
    return { storage };
}

/** Evaluate a browser script (no module system) in the current global scope. */
function loadScript(relPath) {
    const file = path.join(__dirname, '..', '..', relPath);
    const code = fs.readFileSync(file, 'utf8');
    vm.runInThisContext(code, { filename: file });
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const APP_ROOT = path.join(__dirname, '..', '..');
const FIRMWARE_ROOT = path.join(REPO_ROOT, 'StepperMote');

function readAppFile(name) {
    return fs.readFileSync(path.join(APP_ROOT, name), 'utf8');
}

function readFirmwareFile(name) {
    return fs.readFileSync(path.join(FIRMWARE_ROOT, name), 'utf8');
}

module.exports = {
    LocalStorageStub,
    installBrowserStubs,
    loadScript,
    readAppFile,
    readFirmwareFile,
    APP_ROOT,
    FIRMWARE_ROOT
};

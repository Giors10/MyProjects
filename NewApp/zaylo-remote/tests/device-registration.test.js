'use strict';

/**
 * Pending device-registration queue: a Firestore addDevice that fails at setup
 * time (offline / auth race) must be queued and recovered on the next app
 * load — otherwise the dashboard's merge drops the blind from view once its
 * 5-minute local grace period expires.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserStubs } = require('./helpers/stubs');

const { storage } = installBrowserStubs();
const { DeviceService } = require('../device-service.js');

const KEY = 'zaylo-pending-device-reg';
const DEVICE = { id: 'A1B2C3', name: 'Bedroom Blind', type: 'blind' };

function queued() {
    return JSON.parse(storage.getItem(KEY) || '[]');
}

test.beforeEach(() => {
    storage.clear();
    delete DeviceService._addDeviceStub;
});

test('a registration attempted before the home is known is queued, not lost', async () => {
    const ok = await DeviceService.addDeviceReliably(null, DEVICE);
    assert.equal(ok, false);
    assert.equal(queued().length, 1);
    assert.equal(queued()[0].id, 'A1B2C3');
});

test('a failed Firestore write is queued for retry', async () => {
    const original = DeviceService.addDevice;
    DeviceService.addDevice = async () => false; // simulate offline/permission failure
    try {
        const ok = await DeviceService.addDeviceReliably('home-1', DEVICE);
        assert.equal(ok, false);
        assert.equal(queued().length, 1);
    } finally {
        DeviceService.addDevice = original;
    }
});

test('queue dedupes by device id (a retry of the same blind never doubles up)', () => {
    DeviceService.queuePendingRegistration(DEVICE);
    DeviceService.queuePendingRegistration({ ...DEVICE, name: 'Renamed' });
    const list = queued();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Renamed', 'latest details win');
});

test('flushPendingRegistrations writes queued devices and clears the queue', async () => {
    DeviceService.queuePendingRegistration(DEVICE);
    const written = [];
    const original = DeviceService.addDevice;
    DeviceService.addDevice = async (homeId, device) => { written.push({ homeId, device }); return true; };
    try {
        await DeviceService.flushPendingRegistrations('home-1');
    } finally {
        DeviceService.addDevice = original;
    }
    assert.equal(written.length, 1);
    assert.equal(written[0].homeId, 'home-1');
    assert.equal(written[0].device.id, 'A1B2C3');
    assert.equal(storage.getItem(KEY), null, 'queue must be cleared after success');
});

test('devices that still fail stay queued for the next attempt', async () => {
    DeviceService.queuePendingRegistration(DEVICE);
    DeviceService.queuePendingRegistration({ id: 'D4E5F6', name: 'Office Blind', type: 'blind' });
    const original = DeviceService.addDevice;
    DeviceService.addDevice = async (homeId, device) => device.id === 'A1B2C3'; // only one succeeds
    try {
        await DeviceService.flushPendingRegistrations('home-1');
    } finally {
        DeviceService.addDevice = original;
    }
    const list = queued();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'D4E5F6');
});

test('flush without a home id is a safe no-op', async () => {
    DeviceService.queuePendingRegistration(DEVICE);
    await DeviceService.flushPendingRegistrations(null);
    assert.equal(queued().length, 1, 'queue must survive until a home exists');
});

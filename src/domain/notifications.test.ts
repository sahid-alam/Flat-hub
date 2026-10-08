import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MODE_LABEL, TRIGGERS, defaultMode, modeFor, modesFor } from './notifications.ts';

const by = (key: string) => {
  const t = TRIGGERS.find((x) => x.key === key);
  assert.ok(t, `no trigger ${key}`);
  return t;
};

test('the catalogue is the 22 triggers of docs/NOTIFICATIONS.md, keyed uniquely', () => {
  assert.equal(TRIGGERS.length, 22);
  assert.equal(new Set(TRIGGERS.map((t) => t.key)).size, 22);
  // the shape notification_pref.trigger's check constraint accepts
  for (const t of TRIGGERS) assert.match(t.key, /^[a-z][a-z0-9_]{2,39}$/);
});

test('only a push can make a sound', () => {
  assert.deepEqual(modesFor(by('duty_not_ticked')), ['sound', 'silent', 'off']);
  assert.deepEqual(modesFor(by('shopping_added')), ['silent', 'off']);
  assert.equal(MODE_LABEL[defaultMode(by('shopping_added'))], 'Silent');
  assert.equal(MODE_LABEL[defaultMode(by('duty_not_ticked'))], 'Sound');
});

test('the locked four cannot be switched off, however the row got that way', () => {
  for (const key of ['duty_due_today', 'topup_not_in', 'reimbursed', 'month_ready_to_close']) {
    assert.ok(by(key).locked, `${key} must be locked`);
    assert.ok(!modesFor(by(key)).includes('off'), `${key} must not offer off`);
    assert.notEqual(modeFor(by(key), 'off'), 'off');
  }
});

test('an absent row is the default; a stored choice wins', () => {
  assert.equal(modeFor(by('duty_due_today'), undefined), 'sound');
  assert.equal(modeFor(by('duty_due_today'), 'silent'), 'silent');
  assert.equal(modeFor(by('lot_expiring'), undefined), 'silent');
  assert.equal(modeFor(by('lot_expiring'), 'off'), 'off');
  // 'sound' is not on offer for a digest trigger, so it falls back rather than lying
  assert.equal(modeFor(by('lot_expiring'), 'sound'), 'silent');
});

const MIGRATION = '../../supabase/migrations/20261008203000_b5_profile.sql';
const sql = () => readFileSync(new URL(MIGRATION, import.meta.url), 'utf8');
const quoted = (s: string) => [...s.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();

test("the migration's key list matches this file's", () => {
  const list = sql().match(/trigger in \(([^)]*)\)/);
  assert.ok(list, 'no trigger-key check constraint in the migration');
  assert.deepEqual(
    quoted(list[1]),
    TRIGGERS.map((t) => t.key).sort(),
    'the SQL check constraint has drifted from TRIGGERS',
  );
});

test("the migration's locked list matches this file's", () => {
  const list = sql().match(/trigger not in\s*\(([^)]*)\)/);
  assert.ok(list, 'no locked-trigger check constraint in the migration');
  assert.deepEqual(
    quoted(list[1]),
    TRIGGERS.filter((t) => t.locked)
      .map((t) => t.key)
      .sort(),
    'the SQL check constraint has drifted from TRIGGERS',
  );
});

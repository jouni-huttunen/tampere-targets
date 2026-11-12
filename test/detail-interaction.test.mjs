import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { cachedDetail, loadDetail } from '../web/src/lib/details.js';

test('details: revisits use cache; failed and aborted loads can be retried', async (t) => {
  let calls = 0;
  let fail = false;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => ({ card_id: 1, photos: [] }) };
  });
  const first = await loadDetail(1);
  assert.equal(await loadDetail(1), first);
  assert.equal(cachedDetail(1), first);
  assert.equal(calls, 1);
  fail = true;
  await assert.rejects(loadDetail(2));
  assert.equal(cachedDetail(2), null);
  fail = false;
  await loadDetail(2);
  controller.abort();
  await assert.rejects(loadDetail(3, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(cachedDetail(3), null);
  await loadDetail(3);
  assert.ok(cachedDetail(3));
});

// Exercise the actual gesture hook with browser-style pointer sequences and hook lifetimes.
function gesture() {
  const source = readFileSync(new URL('../web/src/components/DetailDrawer.jsx', import.meta.url), 'utf8');
  const hook = source.slice(source.indexOf('function useSwipeStep('), source.indexOf('export default function DetailDrawer'));
  const listeners = {};
  const options = {};
  const steps = [];
  const pane = { style: {}, clientWidth: 412 };
  const root = { addEventListener: (key, fn, opts) => { listeners[key] = fn; options[key] = opts; }, removeEventListener() {} };
  vm.runInNewContext(`${hook}; useSwipeStep(true, {current:root}, {current:pane}, 1, true, step);`, {
    root, pane, step: (dir) => steps.push(dir), useRef: (v) => ({ current: v }),
    useEffect: (fn) => fn(), useLayoutEffect() {}, reducedMotion: () => true,
    NO_SWIPE: '.gallery, pre, input, select, textarea', SLIDE_MS: 200, setTimeout, clearTimeout,
  });
  const send = (type, x, y, extra = {}) => listeners[type]({
    clientX: x, clientY: y, timeStamp: 100, pointerId: 1, pointerType: 'touch',
    isPrimary: true, target: { closest: () => false },
    preventDefault: () => assert.fail('Gesture must never block native scrolling'), ...extra,
  });
  return { send, steps, options };
}

test('a small sideways wobble followed by vertical scroll does not cancel scrolling or step', () => {
  const { send, steps, options } = gesture();
  assert.equal(options.pointermove.passive, true);
  send('pointerdown', 100, 100);
  send('pointermove', 104, 101);
  send('pointermove', 105, 120);
  send('pointermove', 260, 150);
  send('pointerup', 260, 150);
  assert.deepEqual(steps, []);
});

test('horizontal swipes step, but cancelled, multitouch and gallery gestures do not', () => {
  const { send, steps } = gesture();
  send('pointerdown', 250, 100);
  send('pointermove', 100, 102);
  send('pointerup', 100, 102);
  assert.deepEqual(steps, [1]);
  for (const cancel of ['pointercancel', 'multitouch']) {
    send('pointerdown', 250, 100);
    send('pointermove', 100, 102);
    if (cancel === 'multitouch') send('pointerdown', 200, 100, { isPrimary: false, pointerId: 2 });
    else send('pointercancel', 100, 102);
    send('pointerup', 100, 102);
  }
  send('pointerdown', 250, 100, { target: { closest: () => true } });
  send('pointermove', 100, 102);
  send('pointerup', 100, 102);
  assert.deepEqual(steps, [1]);
});

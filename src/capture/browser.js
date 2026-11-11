// In-page capture logic. NOT a module: build.mjs wraps this file, the shared
// functions (planRun, detailsDue, searchUrl, detailUrl, fileStamp) and two
// constants (STATE, CONFIG) into one IIFE that the user pastes into DevTools.
//
// Rules this file must keep (docs/02-data-source.md, section 10):
//   - one request at a time, CONFIG.delayMs + jitter apart
//   - stop at once on HTTP 403 or 429; never work around a block
//   - talk only to the page's own origin; write only one local download
// Keep it ASCII-only so the clipboard copy is safe.

/* global STATE, CONFIG, planRun, detailsDue, searchUrl, detailUrl, fileStamp */

var TCB_HOST = 'asunnot.oikotie.fi';
var TCB_FORMAT = 'tampere-city-boy/oikotie-capture@1';
var TCB_BACKOFF_MS = [5000, 15000, 45000];
var TCB_MAX_FAILS_IN_ROW = 5;

function tcbPanel() {
  var box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;padding:14px 16px;' +
    'background:#fff;color:#0b2540;border:1px solid #c9dcec;border-radius:10px;' +
    'box-shadow:0 8px 30px rgba(11,37,64,.18);font:13px/1.5 system-ui,Segoe UI,sans-serif;';
  var title = document.createElement('div');
  title.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:6px;';
  title.textContent = 'Tampere capture';
  var body = document.createElement('div');
  body.style.cssText = 'white-space:pre-line;font-variant-numeric:tabular-nums;';
  var note = document.createElement('div');
  note.style.cssText = 'margin-top:8px;color:#4b6b88;font-size:12px;';
  var button = document.createElement('button');
  button.style.cssText =
    'margin-top:10px;padding:6px 14px;border:1px solid #0b2540;border-radius:6px;' +
    'background:#fff;color:#0b2540;font:inherit;cursor:pointer;';
  button.textContent = 'Stop';
  box.appendChild(title);
  box.appendChild(body);
  box.appendChild(note);
  box.appendChild(button);
  (document.body || document.documentElement).appendChild(box);
  var onClick = null;
  button.addEventListener('click', function () {
    if (onClick) onClick();
  });
  return {
    text: function (lines) { body.textContent = lines.join('\n'); },
    note: function (text) { note.textContent = text; },
    button: function (label, handler) { button.textContent = label; onClick = handler; },
    close: function () { box.remove(); },
  };
}

function tcbReadTokens() {
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  }
  var tokens = { token: meta('api-token'), cuid: meta('cuid'), loaded: meta('loaded') };
  return tokens.token && tokens.cuid && tokens.loaded ? tokens : null;
}

function tcbUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  var s = '';
  for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function tcbDownload(file) {
  var name = 'oikotie-' + fileStamp(new Date(file.startedAt)) + '.json';
  var blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.cssText = 'display:none;';
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  return name;
}

function tcbDuration(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  var m = Math.floor(s / 60);
  return m > 0 ? m + ' min ' + (s % 60) + ' s' : s + ' s';
}

async function tcbRun(panel, firstTokens) {
  var tokens = firstTokens;
  var startedAt = new Date();
  var plan = planRun(STATE, CONFIG, startedAt.getTime());
  var file = {
    format: TCB_FORMAT,
    captureId: tcbUuid(),
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    mode: plan.mode,
    ageFilter: plan.ageFilter,
    planReason: plan.reason,
    sweepComplete: false,
    found: null,
    detailsDue: 0,
    detailsPlanned: 0,
    stoppedReason: null,
    config: { areas: CONFIG.areas, sizeMin: CONFIG.sizeMin, priceMax: CONFIG.priceMax },
    searchCards: [],
    details: {},
    requests: [],
    errors: [],
  };

  var stopReason = null;
  var wake = null;
  var requestCount = 0;
  var totalMs = 0;
  var progress = { pages: 0, pagesPlanned: null, details: 0 };

  function stop(reason) {
    if (!stopReason) stopReason = reason;
    if (wake) wake();
  }
  window.captureStop = function () { stop('user'); };
  panel.button('Stop', function () { stop('user'); });

  function sleep(ms) {
    if (stopReason) return Promise.resolve();
    return new Promise(function (resolve) {
      var timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        wake = null;
        resolve();
      }
      wake = done;
    });
  }

  function render(phase) {
    var perRequest = CONFIG.delayMs + CONFIG.jitterMs / 2 + (requestCount ? totalMs / requestCount : 300);
    var left = 0;
    if (progress.pagesPlanned !== null) left += Math.max(0, progress.pagesPlanned - progress.pages);
    left += Math.max(0, file.detailsPlanned - progress.details);
    var lines = [
      phase,
      'Mode: ' + (plan.mode === 'full' ? 'full sweep' : 'incremental, newer than ' + plan.ageFilter + ' d') + ' (' + plan.reason + ')',
      'Search pages: ' + progress.pages + (progress.pagesPlanned !== null ? ' / ' + progress.pagesPlanned : ''),
      'Details: ' + progress.details + ' / ' + file.detailsPlanned +
        (file.detailsDue > file.detailsPlanned ? ' (of ' + file.detailsDue + ' due)' : ''),
      'Elapsed: ' + tcbDuration(Date.now() - startedAt.getTime()) + (left ? ' - about ' + tcbDuration(left * perRequest) + ' left' : ''),
      'Errors: ' + file.errors.length,
    ];
    panel.text(lines);
  }

  // One paced request with retries. Resolves to one of:
  //   { status: 200, json }  { status: 404 }  { stopped: true }  { failed: true, status }
  async function api(url) {
    var authRetried = false;
    for (var attempt = 0; ; attempt++) {
      if (stopReason) return { stopped: true };
      if (requestCount > 0) {
        await sleep(CONFIG.delayMs + Math.floor(Math.random() * (CONFIG.jitterMs + 1)));
        if (stopReason) return { stopped: true };
      }
      requestCount++;
      var t0 = Date.now();
      var status = 0;
      var json = null;
      var message = null;
      try {
        var res = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'OTA-token': tokens.token, 'OTA-cuid': tokens.cuid, 'OTA-loaded': tokens.loaded },
        });
        status = res.status;
        if (status === 200) {
          try {
            json = await res.json();
          } catch (e) {
            message = 'invalid JSON';
          }
        }
      } catch (e) {
        message = String((e && e.message) || e);
      }
      var ms = Date.now() - t0;
      totalMs += ms;
      file.requests.push({ at: new Date(t0).toISOString(), url: url, status: status, ms: ms });

      if (status === 200 && json) return { status: 200, json: json };
      if (status === 403 || status === 429) {
        stop('http-' + status);
        return { stopped: true };
      }
      if (status === 401) {
        var fresh = tcbReadTokens();
        if (!authRetried && fresh) {
          authRetried = true;
          tokens = fresh;
          continue;
        }
        stop('auth');
        return { stopped: true };
      }
      if (status === 404) return { status: 404 };
      var retryable = status === 0 || status === 200 || status >= 500;
      if (retryable && attempt < TCB_BACKOFF_MS.length) {
        await sleep(TCB_BACKOFF_MS[attempt]);
        continue;
      }
      file.errors.push({ at: new Date().toISOString(), url: url, status: status, message: message || 'HTTP ' + status });
      return { failed: true, status: status };
    }
  }

  // 1. Search
  render('Searching...');
  var cards = new Map();
  var searchOk = true;
  var found = null;
  for (var offset = 0; ; offset += CONFIG.pageSize) {
    var page = await api(searchUrl(CONFIG, offset, plan.ageFilter));
    if (page.stopped) {
      searchOk = false;
      break;
    }
    if (page.status !== 200 || !page.json || !Array.isArray(page.json.cards)) {
      searchOk = false;
      stop('error');
      break;
    }
    var at = new Date().toISOString();
    found = Number(page.json.found);
    for (var i = 0; i < page.json.cards.length; i++) {
      var card = page.json.cards[i];
      if (card && card.cardId != null && !cards.has(card.cardId)) cards.set(card.cardId, { fetchedAt: at, card: card });
    }
    progress.pages++;
    progress.pagesPlanned = Math.max(progress.pages, Math.ceil(found / CONFIG.pageSize));
    render('Searching...');
    if (page.json.cards.length === 0 || offset + CONFIG.pageSize >= found) break;
  }
  file.found = found;
  file.searchCards = Array.from(cards.values());
  file.sweepComplete = searchOk && found !== null && cards.size === found;

  // 2. Details
  if (!stopReason) {
    var due = detailsDue(
      file.searchCards.map(function (entry) { return entry.card; }),
      STATE,
      CONFIG,
      startedAt.getTime(),
      { onlySeen: plan.mode === 'full' && file.sweepComplete }
    );
    var todo = due.slice(0, CONFIG.maxDetails);
    file.detailsDue = due.length;
    file.detailsPlanned = todo.length;
    var failsInRow = 0;
    render('Fetching details...');
    for (var j = 0; j < todo.length; j++) {
      var detail = await api(detailUrl(todo[j]));
      if (detail.stopped) break;
      if (detail.status === 200) {
        file.details[todo[j]] = { fetchedAt: new Date().toISOString(), status: 200, json: detail.json };
        failsInRow = 0;
      } else if (detail.status === 404) {
        file.details[todo[j]] = { fetchedAt: new Date().toISOString(), status: 404, json: null };
        failsInRow = 0;
      } else if (++failsInRow >= TCB_MAX_FAILS_IN_ROW) {
        stop('error');
        break;
      }
      progress.details = j + 1;
      render('Fetching details...');
    }
  }

  // 3. Save
  file.stoppedReason = stopReason;
  file.finishedAt = new Date().toISOString();
  window.captureDownload = function () { return tcbDownload(file); };
  var name = tcbDownload(file);
  var headline = !stopReason
    ? 'Done.'
    : stopReason === 'user'
      ? 'Stopped by you.'
      : stopReason === 'auth'
        ? 'Stopped: Oikotie no longer accepts the page tokens. Reload the page and paste again.'
        : stopReason === 'error'
          ? 'Stopped after repeated errors.'
          : 'Stopped: Oikotie refused the requests (' + stopReason + '). Do not retry now.';
  render(headline);
  panel.note('Saved ' + name + ' to Downloads. Next: npm run import   (If no file appeared, run captureDownload() here.)');
  panel.button('Close', function () { panel.close(); });
  return file;
}

function tcbStart() {
  if (location.hostname !== TCB_HOST) {
    var wrong = tcbPanel();
    wrong.text(['This script only runs on ' + TCB_HOST + '.', 'Open that site, then paste it there.']);
    wrong.button('Close', function () { wrong.close(); });
    return;
  }
  if (window.__tcbCapture && window.__tcbCapture.running) {
    console.warn('[capture] A capture is already running in this tab.');
    return;
  }
  var panel = tcbPanel();
  var tokens = tcbReadTokens();
  if (!tokens) {
    panel.text(['Could not find the page tokens (meta tags).', 'Reload the page and paste again.']);
    panel.button('Close', function () { panel.close(); });
    return;
  }
  panel.note('Keep this tab in front until it finishes. Stop any time with the button or captureStop().');
  var state = { running: true, promise: null };
  window.__tcbCapture = state;
  state.promise = tcbRun(panel, tokens).then(
    function (file) {
      state.running = false;
      return file;
    },
    function (err) {
      state.running = false;
      console.error('[capture] failed', err);
      panel.text(['The capture script failed: ' + String((err && err.message) || err), 'Nothing was saved. Please report this.']);
      panel.button('Close', function () { panel.close(); });
      return null;
    }
  );
}

// Listing text formatter (web/src/lib/richtext.js): plain and HTML texts into the same paragraphs,
// lines and bold runs. Synthetic texts only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeEntities, parseRichText } from '../web/src/lib/richtext.js';

/** Paragraphs as strings: lines joined by " | ", bold runs wrapped in *…*. */
const show = (text) => parseRichText(text).map((p) => p.map((l) => l.map((r) => (r.bold ? `*${r.text}*` : r.text)).join('')).join(' | '));

test('plain text: blank lines make paragraphs, single newlines line breaks', () => {
  assert.deepEqual(show('Valoisa kaksio.\nHyvä sijainti.\n\nVapaa heti.'), ['Valoisa kaksio. | Hyvä sijainti.', 'Vapaa heti.']);
  assert.deepEqual(show('Yksi rivi'), ['Yksi rivi']);
  assert.deepEqual(show('A\r\n\r\n\r\nB'), ['A', 'B']);
});

test('nothing to show: null, empty and whitespace give no paragraphs', () => {
  assert.deepEqual(parseRichText(null), []);
  assert.deepEqual(parseRichText(''), []);
  assert.deepEqual(parseRichText(' \n\n '), []);
  assert.deepEqual(parseRichText('<p></p><p> </p>'), []);
});

test('HTML: <p> paragraphs, <br> lines, <b> and <strong> bold', () => {
  assert.deepEqual(show('<p><b>Vuokra-asunto</b></p><p>Valoisa kaksio.<br>Hyvä sijainti.</p>'), ['*Vuokra-asunto*', 'Valoisa kaksio. | Hyvä sijainti.']);
  assert.deepEqual(show('<p>Alku <strong>tärkeä</strong> loppu</p>'), ['Alku *tärkeä* loppu']);
  assert.deepEqual(show('Rivi 1<br/>Rivi 2<BR>Rivi 3'), ['Rivi 1 | Rivi 2 | Rivi 3']);
});

test('HTML mixed with newlines: no double gaps next to tags, newlines inside text still break', () => {
  assert.deepEqual(show('<p>Eka</p>\n<p>Toka</p>\n\n<p>Kolmas\nrivi</p>\n'), ['Eka', 'Toka', 'Kolmas | rivi']);
  assert.deepEqual(show('<p>Eka<br>\n</p>'), ['Eka']);
});

test('other tags are dropped but their words kept; lists become bullet lines; bold never goes negative', () => {
  assert.deepEqual(show('<p><span class="x">Sana</span> <i>toinen</i></p>'), ['Sana toinen']);
  assert.deepEqual(show('<ul><li>Sauna</li><li>Parveke</li></ul>'), ['• Sauna | • Parveke']);
  assert.deepEqual(show('</b>Teksti<b>lihava'), ['Teksti*lihava*']);
  assert.deepEqual(show('<p>a < b</p>'), ['a < b']);
});

test('script and style never become anything but text', () => {
  const runs = parseRichText('<p><script>alert(1)</script>Turvallinen</p>').flat(2);
  assert.ok(runs.every((r) => typeof r.text === 'string' && Object.keys(r).sort().join() === 'bold,text'));
  assert.deepEqual(show('<p><a href="https://x.example">linkki</a></p>'), ['linkki']);
});

test('entities are decoded in HTML texts', () => {
  assert.equal(decodeEntities('A &amp; B&nbsp;&euro; &#228;&#x00F6; &auml; &unknown;'), 'A & B € äö ä &unknown;');
  assert.deepEqual(show('<p>Vesi 20&nbsp;&euro;/kk &amp; s&auml;hk&ouml;</p>'), ['Vesi 20 €/kk & sähkö']);
});

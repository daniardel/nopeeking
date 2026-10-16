// The phone page: encrypts the secret on this phone and sends it to the user's PC through the relay.
// Everything shown on the page is set with textContent; nothing from the link or relay is parsed as HTML.
import { aadFor, deriveKey, generateKeyPair, seal, toB64u, unseal } from './e2e.js';
import { parseLink } from './link.js';

const ACK_WAIT_MS = 90_000;
const POLL_MS = 2_000;
const DAMAGED = 'This link is incomplete or damaged. Ask Claude for a new one.';
const UNEXPECTED_REPLY = 'Unexpected reply from the relay. Try again in a minute.';
const NO_REPLY = 'No reply from your PC. Make sure Claude Code is still running there, then ask Claude for a new link.';
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shows one screen. The body's data-state picks the screen's colours in style.css. */
function show(sectionId) {
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== sectionId;
  document.body.dataset.state = sectionId;
}

/** An error also shows the worried padlock beside the message. */
function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status-box').classList.toggle('is-error', isError);
  $('status-face').toggleAttribute('hidden', !isError); // an <svg> has no .hidden property
}

/** An error after which this link can never work again. */
function fatal(message) {
  const error = new Error(message);
  error.fatal = true;
  return error;
}

const link = parseLink(location.hash);
let dead = false; // the link can never work again: nothing typed is kept and Send stays off

/** Clears what was typed and keeps Send off. Used when the link expires or can no longer be answered. */
function killLink() {
  dead = true;
  $('value').value = '';
  $('confirm').value = '';
  $('send').disabled = true;
}

let saved = false; // once the PC has confirmed, the countdown no longer matters
let sending = false; // a send in flight shows the expired screen itself when it ends

function tick() {
  if (saved) return;
  const left = Math.max(0, Math.ceil((link.expiresAt - Date.now()) / 1000));
  if (left === 0) {
    killLink();
    if (!sending) showExpired(link.req.name);
    return;
  }
  $('expires').textContent = `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  setTimeout(tick, 1000);
}

function showExpired(name) {
  $('expired-name').textContent = name;
  show('expired');
}

async function pollAck(key, since) {
  const { req, relay } = link;
  const res = await fetch(`${relay}/${req.topic}/json?poll=1&since=${encodeURIComponent(since)}`);
  if (!res.ok) return null;
  for (const line of (await res.text()).split('\n')) {
    let event;
    let msg;
    try {
      event = JSON.parse(line);
      msg = event.event === 'message' ? JSON.parse(event.message) : null;
    } catch {
      continue;
    }
    if (msg?.t !== 'ack') continue;
    try {
      return await unseal(key, msg, aadFor(req, 'ack'));
    } catch {
      // sealed for an earlier attempt or someone else: ignore
    }
  }
  return null;
}

async function send(value) {
  const { req, pcKey, relay } = link;
  const keys = await generateKeyPair();
  let key;
  try {
    key = await deriveKey(keys.privateKey, pcKey, req.topic);
  } catch {
    throw fatal(DAMAGED); // the PC's key in the link is not a valid curve point
  }
  const box = await seal(key, { value }, aadFor(req, 'sub'));
  const body = JSON.stringify({ t: 'sub', pk: toB64u(keys.publicKeyRaw), ...box });
  // ntfy.sh turns bodies over 4096 bytes into attachments, which the PC never reads. The body is ASCII, so length is bytes.
  if (body.length > 4000) throw new Error('That secret is too long to send from the phone. Use the PC popup instead.');
  let res;
  try {
    res = await fetch(`${relay}/${req.topic}`, { method: 'POST', body });
  } catch {
    throw new Error("Couldn't reach the relay. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(`The relay refused the message (HTTP ${res.status}). Try again in a minute.`);
  let id;
  try {
    id = (await res.json())?.id;
  } catch {
    id = undefined;
  }
  if (typeof id !== 'string' || id === '') throw new Error(UNEXPECTED_REPLY);
  setStatus('Sent. Waiting for your PC to confirm…');
  const deadline = Date.now() + ACK_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const ack = await pollAck(key, id).catch(() => null);
    if (ack) return ack;
  }
  throw fatal(NO_REPLY);
}

if (link.expired) {
  showExpired(link.name);
} else if (link.error) {
  $('problem').textContent = link.error;
  show('bad');
} else {
  const web = link.req.kind === 'web';
  $('name').textContent = link.req.name;
  $('what').textContent = web ? 'the password for' : 'an API key or token for commands';
  $('site').textContent = link.req.site;
  $('site').hidden = !web;
  $('value-label').textContent = web ? 'Password' : 'Key or token';
  $('done-what').textContent = web ? `your ${link.req.name} password` : `your ${link.req.name} key`;
  show('ask');
  tick();

  $('show').addEventListener('change', (event) => {
    for (const id of ['value', 'confirm']) $(id).type = event.target.checked ? 'text' : 'password';
  });

  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (dead) return;
    const value = $('value').value;
    if (value.length < 4) return setStatus('Too short: at least 4 characters.', true);
    if (value.length > 1280) return setStatus('Too long: at most 1280 characters.', true);
    if (value !== $('confirm').value) return setStatus('The two entries do not match.', true);
    if (Date.now() >= link.expiresAt) {
      killLink();
      return showExpired(link.req.name);
    }
    $('send').disabled = true;
    setStatus('Encrypting and sending…');
    sending = true;
    try {
      const reply = await send(value);
      if (reply.ok) {
        saved = true;
        $('value').value = '';
        $('confirm').value = '';
        show('done');
        return;
      }
      setStatus(`Your PC said: ${reply.error}`, true);
    } catch (e) {
      setStatus(e.message, true);
      if (e.fatal) {
        killLink(); // the message says what went wrong, so it stays on screen even if the link has run out too
        return;
      }
    } finally {
      sending = false;
    }
    // The link ran out while this send was waiting: now show that.
    if (Date.now() >= link.expiresAt) return showExpired(link.req.name);
    // Send comes back only while the link is alive: never after it has expired.
    if (!dead) $('send').disabled = false;
  });
}

// The phone page: encrypts the secret on this phone and sends it to the user's PC through the relay.
// Everything shown on the page is set with textContent; nothing from the link or relay is parsed as HTML.
import { aadFor, deriveKey, generateKeyPair, seal, toB64u, unseal } from './e2e.js';
import { parseLink } from './link.js';

const ACK_WAIT_MS = 90_000;
const POLL_MS = 2_000;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function show(sectionId) {
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== sectionId;
}

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').className = isError ? 'error' : '';
}

const link = parseLink(location.hash);

function tick() {
  const left = Math.max(0, Math.ceil((link.expiresAt - Date.now()) / 1000));
  if (left === 0) {
    $('expires').textContent = 'This link has expired. Ask Claude for a new one.';
    $('send').disabled = true;
    return;
  }
  $('expires').textContent = `Link expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  setTimeout(tick, 1000);
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
  const key = await deriveKey(keys.privateKey, pcKey, req.topic);
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
  const { id } = await res.json();
  setStatus('Sent. Waiting for your PC to confirm…');
  const deadline = Date.now() + ACK_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const ack = await pollAck(key, id).catch(() => null);
    if (ack) return ack;
  }
  throw new Error('No reply from your PC. Make sure Claude Code is still running there, then ask Claude for a new link.');
}

if (link.error) {
  $('problem').textContent = link.error;
  show('bad');
} else {
  $('name').textContent = link.req.name;
  $('what').textContent = link.req.kind === 'web' ? `the password for ${link.req.site}` : 'an API key or token for commands';
  show('ask');
  tick();

  $('show').addEventListener('change', (event) => {
    for (const id of ['value', 'confirm']) $(id).type = event.target.checked ? 'text' : 'password';
  });

  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = $('value').value;
    if (value.length < 4) return setStatus('Too short: at least 4 characters.', true);
    if (value.length > 1280) return setStatus('Too long: at most 1280 characters.', true);
    if (value !== $('confirm').value) return setStatus('The two entries do not match.', true);
    if (Date.now() >= link.expiresAt) return setStatus('This link has expired. Ask Claude for a new one.', true);
    $('send').disabled = true;
    setStatus('Encrypting and sending…');
    try {
      const reply = await send(value);
      if (reply.ok) {
        $('value').value = '';
        $('confirm').value = '';
        show('done');
        return;
      }
      setStatus(`Your PC said: ${reply.error}`, true);
    } catch (e) {
      setStatus(e.message, true);
    }
    $('send').disabled = false;
  });
}

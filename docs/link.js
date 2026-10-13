// Reads and checks the one-time link the phone page was opened with. No DOM, so it is tested in Node.
import { fromB64u } from './e2e.js';

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TOPIC_RE = /^pc-[A-Za-z0-9_-]{32}$/;
const SITE_RE = /^[a-z0-9.-]{1,150}$/;
const DAMAGED = { error: 'This link is incomplete or damaged. Ask Claude for a new one.' };

export function parseLink(hash, now = Date.now()) {
  const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  if (p.get('v') !== '1') return DAMAGED;

  const topic = p.get('t') ?? '';
  const name = p.get('n') ?? '';
  const kind = p.get('kind') ?? '';
  const site = p.get('s') ?? '';
  if (!TOPIC_RE.test(topic) || !NAME_RE.test(name)) return DAMAGED;
  if (kind === 'web' ? !SITE_RE.test(site) : kind !== 'command' || site !== '') return DAMAGED;

  let pcKey;
  try {
    pcKey = fromB64u(p.get('k') ?? '');
  } catch {
    return DAMAGED;
  }
  if (pcKey.length !== 65 || pcKey[0] !== 4) return DAMAGED; // uncompressed P-256 public key

  let relay;
  try {
    relay = new URL(p.get('r') ?? '');
  } catch {
    return DAMAGED;
  }
  if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash) return DAMAGED;

  const expiresAt = Number(p.get('e')) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return DAMAGED;
  if (now >= expiresAt) return { error: 'This link has expired. Ask Claude for a new one.' };

  return { req: { topic, name, kind, site }, pcKey, relay: relay.href.replace(/\/+$/, ''), expiresAt };
}

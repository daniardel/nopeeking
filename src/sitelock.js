// Decides whether the page Chrome is showing belongs to a secret's locked site.

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_SCHEME_RE = /^(about|blob|chrome|chrome-extension|data|devtools|edge|file|javascript|view-source):/i;

/** Hostname of an address-bar text or URL, or null if it is not an http(s) page. */
export function hostOf(text) {
  let t = String(text ?? '').trim();
  if (!t || /\s/.test(t) || BARE_SCHEME_RE.test(t)) return null;
  if (!SCHEME_RE.test(t)) t = `https://${t}`;
  let url;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.hostname.toLowerCase().replace(/\.$/, '') || null;
}

/** Turns what the user typed ("Netflix.com", "https://www.netflix.com/login") into a lock site. */
export function normalizeSite(input) {
  const host = hostOf(input);
  if (!host) throw new Error(`"${input}" is not a website address. Use something like netflix.com.`);
  const site = host.replace(/^www\./, '');
  if (site.length > 150) throw new Error('Site address is too long (max 150 characters).');
  if (site !== 'localhost' && !site.includes('.')) throw new Error(`"${site}" is too broad. Use the full site, like netflix.com.`);
  // The phone page accepts only these characters (docs/link.js), so a site with others would be a link it calls damaged.
  if (!/^[a-z0-9.-]+$/.test(site)) throw new Error(`"${site}" has characters a website address can't have. Use something like netflix.com.`);
  return site;
}

export function siteMatches(addressBarText, site) {
  const host = hostOf(addressBarText);
  if (!host) return false;
  return host === site || host.endsWith(`.${site}`);
}

// Rozbor odkazu mailto: (RFC 6068) pro nový e-mail – adresát, kopie, předmět, text.
// Přichází z jiných aplikací, když je ZažijVR Email výchozí poštovní klient (viz src-tauri/src/mailto.rs).
export interface MailtoRequest {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

const clip = (s: string, n: number) => s.slice(0, n);

/** Text z odkazu jako HTML pro editor: vše escapované (odkaz přichází z cizích stránek), řádky jako <br> */
export const mailtoBodyHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br>');
// Pozor: v mailto: (RFC 6068) je „+“ obyčejný znak (jan+vr@gmail.com), ne mezera jako ve formulářích
const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export function parseMailto(url: string): MailtoRequest | null {
  if (!/^mailto:/i.test(url)) return null;
  const rest = url.slice(7);
  const q = rest.indexOf('?');
  const addr = dec(q >= 0 ? rest.slice(0, q) : rest);
  const params = new Map<string, string>();
  if (q >= 0) {
    for (const part of rest.slice(q + 1).split('&')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).toLowerCase();
      const val = dec(part.slice(eq + 1));
      params.set(key, params.has(key) ? `${params.get(key)}, ${val}` : val);
    }
  }
  const to = [addr, params.get('to') ?? ''].map((s) => s.trim()).filter(Boolean).join(', ');
  return {
    to: clip(to, 2000),
    cc: clip(params.get('cc') ?? '', 2000),
    subject: clip(params.get('subject') ?? '', 500),
    body: clip(params.get('body') ?? '', 20000),
  };
}

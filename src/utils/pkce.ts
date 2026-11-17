// PKCE (RFC 7636) a state pro přihlášení Googlem.
// Zachycený autorizační kód (např. jinou aplikací přes odkaz cz.zazijvr.email:) je bez ověřovače
// k ničemu; state chrání před podvrženou odpovědí.

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomString = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

export interface PkceSession {
  /** Tajný ověřovač – zůstává v aplikaci, posílá se až při výměně kódu za token */
  verifier: string;
  /** SHA-256 otisk ověřovače – posílá se Googlu v přihlašovací adrese */
  challenge: string;
  state: string;
}

export const createPkceSession = async (): Promise<PkceSession> => {
  const verifier = randomString(48); // 64 znaků (RFC: 43–128)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)), state: randomString(24) };
};

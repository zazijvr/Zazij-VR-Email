import type { GmailHeader, GmailMessagePart } from '../types/gmail';

export interface MessageBody {
  html: string;
  text: string;
  /** Velké tělo zprávy se musí dotáhnout zvlášť jako příloha */
  attachmentId: string | null;
}

export interface AttachmentInfo {
  filename: string;
  mimeType?: string;
  attachmentId: string;
  size: number;
  /** Doplní se při skládání vlákna – z které zprávy příloha je */
  messageId?: string;
}

export interface InlineImage {
  cid: string;
  mimeType?: string;
  attachmentId?: string;
  data?: string;
  messageId?: string;
}

export const decodeBase64Url = (str: string | null | undefined): string => {
  if (!str) return '';
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      Array.from(window.atob(base64), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
  } catch {
    try {
      return window.atob(base64);
    } catch {
      return '';
    }
  }
};

const unicodeToCp1252: Record<number, number> = {
  8364: 0x80, 8218: 0x82, 402: 0x83, 8222: 0x84, 8230: 0x85, 8224: 0x86, 8225: 0x87,
  710: 0x88, 8240: 0x89, 352: 0x8A, 8249: 0x8B, 338: 0x8C, 381: 0x8E, 8216: 0x91,
  8217: 0x92, 8220: 0x93, 8221: 0x94, 8226: 0x95, 8211: 0x96, 8212: 0x97, 732: 0x98,
  8482: 0x99, 353: 0x9A, 8250: 0x9B, 339: 0x9C, 382: 0x9E, 376: 0x9F
};

// Odstraní zdvojené UTF-8 kódování u nekonsistentních emailových hlaviček
export const decodeMojibake = (str: string | null | undefined): string => {
  if (!str) return '';
  
  const cleanedStr = str
    .replace(/Ã„Â[\s\uFFFD\x8D\x8F]*/g, 'č')
    .replace(/Ã„â€º/g, 'ě');

  const mapByte = (charStr: string): string => {
    let code = charStr.charCodeAt(0);
    if (unicodeToCp1252[code]) code = unicodeToCp1252[code];
    return '%' + code.toString(16).padStart(2, '0');
  };

  return cleanedStr.replace(/[ÃÄÅ][\x80-\xFF\u0152-\u2122]*/g, (match) => {
    try {
      let escaped = '';
      for (let i = 0; i < match.length; i++) escaped += mapByte(match[i]);
      const first = decodeURIComponent(escaped);
      if (first.includes('Ã') || first.includes('Ä') || first.includes('Å')) {
        let esc2 = '';
        for (let j = 0; j < first.length; j++) esc2 += mapByte(first[j]);
        return decodeURIComponent(esc2);
      }
      return first;
    } catch {
      return match;
    }
  });
};

export const getHeader = (headers: GmailHeader[] | undefined, name: string): string => {
  const header = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? decodeMojibake(header.value) : '';
};

export const getMessageBody = (payload: GmailMessagePart): MessageBody => {
  let bodyHTML = '';
  let bodyText = '';
  let bodyAttachmentId: string | null = null;

  const findPart = (part: GmailMessagePart, mimeType: string): GmailMessagePart | null => {
    // If we've found the correct mimeType and it's not a standard attachment (or it's the text body we actually want)
    if (part.mimeType === mimeType && (!part.filename || part.filename === '')) {
      return part;
    }
    if (part.parts) {
      for (const child of part.parts) {
        const found = findPart(child, mimeType);
        if (found) return found;
      }
    }
    return null;
  };

  if (payload.parts) {
    const htmlPart = findPart(payload, 'text/html');
    const textPart = findPart(payload, 'text/plain');

    if (htmlPart && htmlPart.body && htmlPart.body.data) {
      bodyHTML = decodeMojibake(decodeBase64Url(htmlPart.body.data));
    } else if (htmlPart && htmlPart.body && htmlPart.body.attachmentId) {
      bodyAttachmentId = htmlPart.body.attachmentId;
    }

    if (textPart && textPart.body && textPart.body.data) {
      bodyText = decodeMojibake(decodeBase64Url(textPart.body.data));
      if (!bodyHTML) {
        bodyHTML = `<div style="white-space: pre-wrap; font-family: sans-serif;">${bodyText}</div>`;
      }
    } else if (textPart && textPart.body && textPart.body.attachmentId && !bodyAttachmentId) {
      bodyAttachmentId = textPart.body.attachmentId;
    }

    if (bodyHTML || bodyText || bodyAttachmentId) {
      return { html: bodyHTML, text: bodyText, attachmentId: bodyAttachmentId };
    }
  }

  if (payload.body && payload.body.data && !payload.filename) {
     return { html: decodeMojibake(decodeBase64Url(payload.body.data)), text: '', attachmentId: null };
  }
  
  if (bodyAttachmentId) {
     return { html: '', text: '', attachmentId: bodyAttachmentId };
  }
  
  return { html: '<div class="text-[#00f3ff]/50 italic p-4">E-mail neobsahuje čitelné textové tělo, případně je obsaženo pouze v přílohách.</div>', text: '', attachmentId: null };
};

export const extractAttachments = (payload: GmailMessagePart | undefined): AttachmentInfo[] => {
  if (!payload) return [];
  let attachments: AttachmentInfo[] = [];
  
  const contentId = getHeader(payload.headers, 'Content-ID');
  const contentDisposition = getHeader(payload.headers, 'Content-Disposition');
  const isInline = !!contentId || (contentDisposition && contentDisposition.toLowerCase().includes('inline'));

  if (payload.filename && payload.filename.length > 0 && payload.body && payload.body.attachmentId) {
    const isSpammyEmoji = payload.filename.toLowerCase().includes('outlookemoji') || (payload.filename.toLowerCase().startsWith('image00') && (payload.body.size || 0) < 10000);
    
    if (!isSpammyEmoji && !isInline) {
      attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType,
        attachmentId: payload.body.attachmentId,
        size: payload.body.size || 0
      });
    }
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      attachments = attachments.concat(extractAttachments(part));
    }
  }
  return attachments;
};

export const extractInlineImages = (payload: GmailMessagePart | undefined): InlineImage[] => {
  if (!payload) return [];
  let inlines: InlineImage[] = [];
  
  const contentId = getHeader(payload.headers, 'Content-ID');
  
  if (contentId && payload.body) {
    let cid = contentId;
    if (cid.startsWith('<') && cid.endsWith('>')) {
      cid = cid.slice(1, -1);
    }
    inlines.push({
      cid: cid,
      mimeType: payload.mimeType,
      attachmentId: payload.body.attachmentId,
      data: payload.body.data
    });
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      inlines = inlines.concat(extractInlineImages(part));
    }
  }
  return inlines;
};

export const encodeBase64Url = (str: string): string => {
  const bytes = new TextEncoder().encode(str);
  let binStr = '';
  const CHUNK_SIZE = 32000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binStr += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  const base64 = btoa(binStr);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const encodeHeaderName = (headerStr: string | null | undefined): string => {
  if (!headerStr) return '';
  
  const parts: string[] = [];
  let currentGroup = '';
  let inQuotes = false;
  let inBrackets = false;

  for (let i = 0; i < headerStr.length; i++) {
    const char = headerStr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (char === '<') inBrackets = true;
    if (char === '>') inBrackets = false;
    
    // Rozdělíme podle čárky pouze mimo uvozovky a špičaté závorky
    if (char === ',' && !inQuotes && !inBrackets) {
      if (currentGroup.trim()) parts.push(currentGroup.trim());
      currentGroup = '';
    } else {
      currentGroup += char;
    }
  }
  if (currentGroup.trim()) parts.push(currentGroup.trim());

  return parts.map(part => {
    const match = part.match(/^(.*)\s*(<[^>]+>)$/);
    if (match) {
      const name = match[1].replace(/^"|"$/g, '').trim();
      if (!name) return match[2];
      const encodedName = `=?utf-8?B?${btoa(unescape(encodeURIComponent(name)))}?=`;
      return `${encodedName} ${match[2]}`;
    }
    // Fallback pokud adresa nesedí na strict regex
    if (/[^\x00-\x7F]/.test(part)) {
      return `=?utf-8?B?${btoa(unescape(encodeURIComponent(part)))}?=`;
    }
    return part;
  }).join(', ');
};

export const getAvatarInitial = (name: string | null | undefined): string => {
  if (!name) return '?';
  const match = name.match(/\p{L}|\p{N}/u);
  return match ? match[0].toUpperCase() : '?';
};

// Nastavení okna pro psaní e-mailu (EmailComposer)

export interface EmailTemplate {
  id: string;
  title: string;
  subject: string;
  /** HTML */
  body: string;
}

export interface EmailSignature {
  id: string;
  title: string;
  /** HTML */
  body: string;
  /** Vloží se automaticky do nové zprávy */
  isDefault: boolean;
}

export type ComposerType = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft' | 'template';

export interface ComposerConfig {
  type?: ComposerType;
  /** Úprava / nová šablona (type === 'template') */
  templateData?: EmailTemplate;
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  initialAttachments?: ComposerAttachment[];
  /** Citovaná původní zpráva (odpověď, přeposlání) */
  htmlBody?: string;
  messageId?: string;
  threadId?: string;
  rfcMessageId?: string;
  originalFrom?: string;
  originalTo?: string;
  originalCc?: string;
  draftId?: string;
  /** Id zprávy konceptu v seznamu – po odeslání se schová */
  draftMessageId?: string;
}

/** Příloha v okně pro psaní (obsah jako data URL „data:…;base64,…“) */
export interface ComposerAttachment {
  name: string;
  type: string;
  content: string;
}

/** Co okno pro psaní hlásí rodiči po úspěšné akci */
export type ComposerSuccess =
  | { action: 'draft'; meta: { draftId?: string } }
  | { action: 'send'; meta: { draftMessageId?: string } }
  | { action: 'save_template'; meta: EmailTemplate };

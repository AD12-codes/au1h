export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Overrides the configured From for this message, e.g. "Todo App <no-reply@…>". */
  from?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

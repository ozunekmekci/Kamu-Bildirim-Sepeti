export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  delivered: boolean;
  provider: string;
}

export interface EmailAdapter {
  readonly providerName: string;
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
}

const DEFAULT_FROM_EMAIL = 'bildirim@kamubildirimsepeti.com';
const DEFAULT_FROM_NAME = 'Kamu Bildirim Sepeti';
const DEFAULT_FROM_HEADER = `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`;

export class NoopEmailAdapter implements EmailAdapter {
  readonly providerName = 'noop';

  async sendEmail(_message: EmailMessage): Promise<EmailSendResult> {
    void _message;
    return { delivered: false, provider: this.providerName };
  }
}

export class InMemoryEmailAdapter implements EmailAdapter {
  readonly providerName = 'memory';
  readonly sent: EmailMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { delivered: true, provider: this.providerName };
  }
}

export interface ResendEmailAdapterOptions {
  apiKey: string;
  from?: string;
  fetchFn?: typeof fetch;
}

export class ResendEmailAdapter implements EmailAdapter {
  readonly providerName = 'resend';
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: ResendEmailAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    this.from = options.from?.trim() || DEFAULT_FROM_HEADER;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return { delivered: false, provider: this.providerName };
    }

    try {
      const response = await this.fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      return { delivered: response.ok, provider: this.providerName };
    } catch {
      return { delivered: false, provider: this.providerName };
    }
  }
}

export interface MailChannelsEmailAdapterOptions {
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  fetchFn?: typeof fetch;
}

export class MailChannelsEmailAdapter implements EmailAdapter {
  readonly providerName = 'mailchannels';
  private readonly apiKey?: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: MailChannelsEmailAdapterOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fromEmail = options.fromEmail?.trim() || DEFAULT_FROM_EMAIL;
    this.fromName = options.fromName?.trim() || DEFAULT_FROM_NAME;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    try {
      const response = await this.fetchFn('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: message.to }],
            },
          ],
          from: {
            email: this.fromEmail,
            name: this.fromName,
          },
          subject: message.subject,
          content: [
            {
              type: 'text/plain',
              value: message.text,
            },
          ],
        }),
      });
      return { delivered: response.ok, provider: this.providerName };
    } catch {
      return { delivered: false, provider: this.providerName };
    }
  }
}

export function createEmailAdapter(
  env: Record<string, string | undefined> = process.env,
  fetchFn?: typeof fetch,
): EmailAdapter {
  const resendKey = env.RESEND_API_KEY?.trim();
  const fromEmail = env.EMAIL_FROM?.trim();

  if (resendKey) {
    return new ResendEmailAdapter({
      apiKey: resendKey,
      from: fromEmail ? `${DEFAULT_FROM_NAME} <${fromEmail}>` : undefined,
      fetchFn,
    });
  }

  const mailChannelsKey = env.MAILCHANNELS_API_KEY?.trim();
  if (mailChannelsKey) {
    return new MailChannelsEmailAdapter({
      apiKey: mailChannelsKey,
      fromEmail: fromEmail || undefined,
      fetchFn,
    });
  }

  return new NoopEmailAdapter();
}

import { gmail as gmailApi } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';

export const LABEL_MAIN = 'Viewing Agent';
export const LABEL_NEEDS_YOU = 'Viewing Agent/Needs you';
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  // Only used if calendar is enabled in availability.yaml: add bookings and avoid clashes.
  'https://www.googleapis.com/auth/calendar.events',
];

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');
const fromB64url = (s) => Buffer.from(s ?? '', 'base64url').toString('utf8');

export function emailAddress(header) {
  const m = (header ?? '').match(/<([^>]+)>/);
  return (m ? m[1] : header ?? '').trim().toLowerCase();
}

function htmlToText(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBody(payload) {
  const plain = [];
  const html = [];
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) plain.push(fromB64url(part.body.data));
    else if (part.mimeType === 'text/html' && part.body?.data) html.push(fromB64url(part.body.data));
    (part.parts ?? []).forEach(walk);
  };
  walk(payload);
  if (plain.length) return plain.join('\n').trim();
  return htmlToText(html.join('\n'));
}

/** Drop quoted earlier messages so the model sees only what was newly written. */
export function stripQuoted(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const quoteHeader =
      /^On .+wrote:\s*$/.test(line) ||
      /^-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
      (/^From: .+/.test(line) && out.length > 3);
    if (quoteHeader) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export function normaliseMessage(m) {
  const headers = Object.fromEntries((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  return {
    id: m.id,
    threadId: m.threadId,
    labelIds: m.labelIds ?? [],
    date: Number(m.internalDate ?? 0),
    from: headers.from ?? '',
    fromEmail: emailAddress(headers.from),
    replyTo: headers['reply-to'] ? emailAddress(headers['reply-to']) : null,
    to: headers.to ?? '',
    subject: headers.subject ?? '',
    messageIdHeader: headers['message-id'] ?? '',
    references: headers.references ?? '',
    body: stripQuoted(extractBody(m.payload)),
  };
}

function buildRaw({ from, to, subject, body, inReplyTo, references }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  return b64url(`${lines.join('\r\n')}\r\n\r\n${body}`);
}

/** Thin wrapper around the Gmail API with just what the agent needs. */
export class GmailClient {
  constructor({ clientId, clientSecret, refreshToken }) {
    const auth = new OAuth2Client(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    this.auth = auth;
    this.api = gmailApi({ version: 'v1', auth });
    this.labelIds = {};
  }

  async getMyAddress() {
    if (!this.me) {
      const { data } = await this.api.users.getProfile({ userId: 'me' });
      this.me = data.emailAddress.toLowerCase();
    }
    return this.me;
  }

  /** Recent messages not sent by me, oldest first. */
  async listRecentInbound({ days = 7 } = {}) {
    const ids = [];
    let pageToken;
    do {
      const { data } = await this.api.users.messages.list({
        userId: 'me',
        q: `newer_than:${days}d -from:me -in:chats -in:spam -in:trash`,
        maxResults: 100,
        pageToken,
      });
      ids.push(...(data.messages ?? []).map((m) => m.id));
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < 500);
    const msgs = [];
    for (const id of ids) {
      const { data } = await this.api.users.messages.get({ userId: 'me', id, format: 'full' });
      msgs.push(normaliseMessage(data));
    }
    return msgs.sort((a, b) => a.date - b.date);
  }

  async getThread(threadId) {
    const { data } = await this.api.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    return (data.messages ?? []).map(normaliseMessage).sort((a, b) => a.date - b.date);
  }

  async labelId(name) {
    if (this.labelIds[name]) return this.labelIds[name];
    const { data } = await this.api.users.labels.list({ userId: 'me' });
    let label = (data.labels ?? []).find((l) => l.name === name);
    if (!label) {
      ({ data: label } = await this.api.users.labels.create({
        userId: 'me',
        requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
      }));
    }
    return (this.labelIds[name] = label.id);
  }

  async labelThread(threadId, names, removeNames = []) {
    const addLabelIds = await Promise.all(names.map((n) => this.labelId(n)));
    const removeLabelIds = await Promise.all(removeNames.map((n) => this.labelId(n)));
    await this.api.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds, removeLabelIds } });
  }

  /**
   * Send an email. Pass `replyTo` (a normalised message) to reply in its thread.
   * @returns { id, threadId }
   */
  async send({ to, subject, body, replyTo }) {
    const from = await this.getMyAddress();
    let threadId;
    let inReplyTo;
    let references;
    if (replyTo) {
      threadId = replyTo.threadId;
      inReplyTo = replyTo.messageIdHeader || undefined;
      references = [replyTo.references, replyTo.messageIdHeader].filter(Boolean).join(' ') || undefined;
      if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
    }
    const raw = buildRaw({ from, to, subject, body, inReplyTo, references });
    const { data } = await this.api.users.messages.send({ userId: 'me', requestBody: { raw, threadId } });
    return { id: data.id, threadId: data.threadId };
  }
}

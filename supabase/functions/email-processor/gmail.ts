// Minimal Gmail REST client for the email-processor edge function.
// Uses a stored OAuth refresh token + plain fetch (the googleapis Node SDK
// does not port to Deno cleanly). Only the endpoints the processors need:
// labels.list, threads.list, threads.get, threads.modify.

import { fetchWithTimeout, log } from './utils.ts';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GmailMessage {
  id: string;
  payload?: GmailPart;
}

interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPart[];
}

export class GmailClient {
  private accessToken = '';
  private labelIdCache = new Map<string, string>();

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
  ) {}

  /** Exchange the refresh token for a fresh access token. */
  async init(): Promise<void> {
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail token refresh failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    this.accessToken = data.access_token;
    log('INFO', 'Gmail access token obtained');
  }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const res = await fetchWithTimeout(`${GMAIL_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return await res.json();
  }

  async getLabelId(labelName: string): Promise<string | null> {
    if (this.labelIdCache.size === 0) {
      const data = await this.request('/labels');
      for (const label of (data.labels as { id: string; name: string }[]) || []) {
        this.labelIdCache.set(label.name, label.id);
      }
    }
    const id = this.labelIdCache.get(labelName);
    if (!id) {
      log('WARNING', 'Label not found', { labelName });
      return null;
    }
    return id;
  }

  async listThreads(labelName: string): Promise<{ id: string }[]> {
    const labelId = await this.getLabelId(labelName);
    if (!labelId) return [];
    const data = await this.request(`/threads?labelIds=${encodeURIComponent(labelId)}&maxResults=100`);
    const threads = (data.threads as { id: string }[]) || [];
    log('INFO', 'Listed threads for label', { labelName, count: threads.length });
    return threads;
  }

  /** Fetch a thread with full message payloads (bodies included). */
  async getThreadMessages(threadId: string): Promise<GmailMessage[]> {
    const data = await this.request(`/threads/${threadId}?format=full`);
    return (data.messages as GmailMessage[]) || [];
  }

  getHeader(message: GmailMessage, name: string): string {
    const header = (message.payload?.headers || []).find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    );
    return header?.value || '';
  }

  /** Extract the HTML (preferred) or plain-text body from a full message payload. */
  getMessageBody(message: GmailMessage): string {
    const payload = message.payload;
    if (!payload) return '';
    const html = this.findPart(payload, 'text/html');
    if (html) return html;
    const plain = this.findPart(payload, 'text/plain');
    if (plain) return plain;
    log('WARNING', 'No message body found', { messageId: message.id });
    return '';
  }

  // Deviation from the Node version: searches MIME parts recursively, so
  // nested multipart/alternative bodies (which Node returned as '') are found.
  private findPart(part: GmailPart, mimeType: string): string | null {
    if (part.mimeType === mimeType && part.body?.data) {
      return this.decodeBase64Url(part.body.data);
    }
    for (const child of part.parts || []) {
      const found = this.findPart(child, mimeType);
      if (found) return found;
    }
    return null;
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async moveThread(threadId: string, sourceLabel: string, targetLabel: string): Promise<void> {
    const sourceLabelId = await this.getLabelId(sourceLabel);
    const targetLabelId = await this.getLabelId(targetLabel);
    if (!sourceLabelId || !targetLabelId) {
      throw new Error(`Cannot move thread ${threadId}: label missing (${sourceLabel} -> ${targetLabel})`);
    }
    await this.request(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({
        removeLabelIds: [sourceLabelId],
        addLabelIds: [targetLabelId],
      }),
    });
    log('INFO', 'Thread moved', { threadId, from: sourceLabel, to: targetLabel });
  }
}

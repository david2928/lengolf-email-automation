// LINE Messaging API notifications, ported from src/services/lineNotificationService.js
// and src/utils/lineMessaging.js. Message formats are preserved verbatim.
// Deviation from the Node version: no separate /info token-validation call before
// each push — the push itself surfaces auth errors, and one fewer network call
// per notification keeps cycles short.

import { calculateEndTime24, fetchWithTimeout, formatDisplayDate, log } from './utils.ts';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_TIMEOUT_MS = 30_000;
const LINE_MAX_LENGTH = 5000;

export interface BookingNotification {
  bookingId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  date: string;
  startTime: string;
  duration: number;
  bay?: string;
  numberOfPeople: number;
  channel: string;
  isNewCustomer?: boolean;
  notes?: string;
  cancelledBy?: string;
  cancellationReason?: string;
}

export class LineNotifier {
  constructor(
    private channelAccessToken: string,
    private groupId: string,
    private serviceType: string,
  ) {
    if (!channelAccessToken || !groupId) {
      throw new Error(`LINE channel token and group ID are required (${serviceType})`);
    }
  }

  private async push(message: string): Promise<void> {
    let text = message;
    if (text.length > LINE_MAX_LENGTH) {
      log('WARN', 'Message exceeds LINE character limit, truncating', {
        serviceType: this.serviceType,
        originalLength: text.length,
      });
      text = text.substring(0, LINE_MAX_LENGTH - 3) + '...';
    }

    const res = await fetchWithTimeout(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: this.groupId,
        messages: [{ type: 'text', text }],
      }),
    }, LINE_TIMEOUT_MS);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LINE push failed (${res.status}): ${body.slice(0, 300)}`);
    }
    log('INFO', 'LINE message sent', { serviceType: this.serviceType });
  }

  async sendBookingCreated(b: BookingNotification): Promise<void> {
    const formattedDate = formatDisplayDate(b.date);
    const startTime = b.startTime.slice(0, 5);
    const endTime = calculateEndTime24(startTime, b.duration);

    let message = `Booking Notification (ID: ${b.bookingId})\n`;
    message += `Customer Name: ${b.isNewCustomer ? 'New Customer' : b.customerName}\n`;
    message += `Booking Name: ${b.customerName}\n`;
    if (b.customerEmail) {
      message += `Email: ${b.customerEmail}\n`;
    }
    message += `Phone: ${b.customerPhone}\n`;
    message += `Date: ${formattedDate}\n`;
    message += `Time: ${startTime} - ${endTime}\n`;
    message += `Bay: ${b.bay}\n`;
    message += `Type: Normal Bay Rate\n`;
    message += `People: ${b.numberOfPeople}\n`;
    message += `Channel: ${b.channel}`;
    if (b.notes) {
      message += `\n\nNote: ${b.notes}`;
    }
    await this.push(message);
  }

  async sendBookingCancelled(b: BookingNotification): Promise<void> {
    const formattedDate = formatDisplayDate(b.date);
    const startTime = b.startTime.slice(0, 5);
    const durationHours = b.duration ? `${b.duration}h` : '';

    let message = `🚫 BOOKING CANCELLED (ID: ${b.bookingId}) 🚫\n`;
    message += `----------------------------------\n`;
    message += `👤 Customer: ${b.customerName}\n`;
    message += `📞 Phone: ${b.customerPhone}\n`;
    message += `🗓️ Date: ${formattedDate}\n`;
    message += `⏰ Time: ${startTime}${durationHours ? ` (Duration: ${durationHours})` : ''}\n`;
    message += `⛳ Bay: ${b.bay}\n`;
    message += `🧑‍🤝‍🧑 Pax: ${b.numberOfPeople}\n`;
    message += `📍 Channel: ${b.channel}\n`;
    message += `----------------------------------\n`;
    message += `🗑️ Cancelled By: ${b.cancelledBy || 'Email Automation'}\n`;
    if (b.cancellationReason) {
      message += `💬 Reason: ${b.cancellationReason}`;
    }
    await this.push(message);
  }

  async sendNoSlotsAvailable(b: BookingNotification): Promise<void> {
    const formattedDate = formatDisplayDate(b.date);
    const startTime = b.startTime.slice(0, 5);
    const endTime = calculateEndTime24(startTime, b.duration);

    const message = `[New ${b.channel} Booking] ` +
      `Customer ${b.customerName} ` +
      `(${b.customerPhone}), ` +
      `${b.numberOfPeople} PAX on ` +
      `${formattedDate} from ` +
      `${startTime} - ${endTime}. ` +
      `Please check bay availability and call back customer to confirm and submit booking form.\n\n` +
      `⚠️ NO SLOTS AVAILABLE - Manual handling required.`;
    await this.push(message);
  }
}

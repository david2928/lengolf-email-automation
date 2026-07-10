// ClassPass and ResOS email processors, ported from
// src/processors/{classPassProcessor,webResosProcessor}.js.
//
// Fixes applied during the port:
// - ClassPass date parsing no longer goes through new Date().toISOString()
//   (which shifted the date -1 day in non-UTC timezones); it uses the
//   deterministic parseMonthNameDate() instead.
// - Each invocation processes at most MAX_THREADS_PER_SOURCE threads per label
//   and respects a wall-clock deadline, so a backlog drains across cycles
//   instead of blowing the edge-function execution limit.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GmailClient, GmailMessage } from './gmail.ts';
import { LineNotifier } from './notify.ts';
import { BookingService, CustomerService, EmailTrackingService, SourceType } from './services.ts';
import { extractPlainText, isTransientError, log, parseMonthNameDate, parseTimeToStandard } from './utils.ts';

const MAX_THREADS_PER_SOURCE = 20;

export interface CycleStats {
  threadsSeen: number;
  processed: number;
  bookingsCreated: number;
  bookingsCancelled: number;
  noSlots: number;
  errors: number;
  skippedAlreadyProcessed: number;
  extractionFailures: number;
}

function newStats(): CycleStats {
  return {
    threadsSeen: 0, processed: 0, bookingsCreated: 0, bookingsCancelled: 0,
    noSlots: 0, errors: 0, skippedAlreadyProcessed: 0, extractionFailures: 0,
  };
}

interface ReservationDetails {
  isCancellation: boolean;
  date: string;
  startTime: string;
  duration: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  numberOfPeople: number;
  reservationKey?: string | null;
}

abstract class BaseProcessor {
  protected emailTracking: EmailTrackingService;
  protected customerService: CustomerService;
  protected bookingService: BookingService;

  constructor(
    protected gmail: GmailClient,
    supabase: SupabaseClient,
    protected line: LineNotifier,
    protected sourceLabel: string,
    protected completedLabel: string,
    protected sourceType: SourceType,
    protected channel: string,
    protected deadline: number,
  ) {
    this.emailTracking = new EmailTrackingService(supabase);
    this.customerService = new CustomerService(supabase);
    this.bookingService = new BookingService(supabase);
  }

  protected abstract extractDetails(bodyText: string, subject: string): ReservationDetails | null;
  protected abstract allowFuzzyNameMatching(): boolean;
  protected abstract bookingNotes(): string;
  protected abstract lineNotes(): string;
  protected abstract reservationKeySupported(): boolean;

  async processEmails(): Promise<CycleStats> {
    const stats = newStats();
    const threads = await this.gmail.listThreads(this.sourceLabel);
    log('INFO', `Processing ${this.sourceType} threads`, { count: threads.length });

    for (const thread of threads.slice(0, MAX_THREADS_PER_SOURCE)) {
      if (Date.now() > this.deadline) {
        log('WARN', 'Cycle deadline reached, deferring remaining threads to next cycle', {
          sourceType: this.sourceType,
          remaining: threads.length - stats.threadsSeen,
        });
        break;
      }
      stats.threadsSeen++;
      try {
        await this.processThread(thread.id, stats);
      } catch (threadError) {
        stats.errors++;
        log('ERROR', `Error processing ${this.sourceType} thread ${thread.id}`, {
          error: (threadError as Error).message,
        });
        // Continue processing other threads
      }
    }
    return stats;
  }

  private async processThread(threadId: string, stats: CycleStats): Promise<void> {
    const messages = await this.gmail.getThreadMessages(threadId);

    for (const message of messages) {
      const gmailMessageId = message.id;

      if (await this.emailTracking.isProcessed(gmailMessageId)) {
        stats.skippedAlreadyProcessed++;
        await this.gmail.moveThread(threadId, this.sourceLabel, this.completedLabel);
        continue;
      }

      const bodyText = extractPlainText(this.gmail.getMessageBody(message));
      const subject = this.gmail.getHeader(message, 'subject');
      const emailMetadata = { subject, date: this.gmail.getHeader(message, 'date') };

      // Extraction must never throw (a malformed email would otherwise become a
      // poison thread retried every cycle) — match the Node try/catch-to-null.
      let details: ReservationDetails | null = null;
      try {
        details = this.extractDetails(bodyText, subject);
      } catch (extractError) {
        log('ERROR', `Extraction threw for ${this.sourceType} email`, {
          messageId: message.id,
          error: (extractError as Error).message,
        });
      }
      if (!details) {
        stats.extractionFailures++;
        log('WARN', `Could not extract details from ${this.sourceType} email`, {
          threadId,
          messageId: message.id,
          subject,
        });
        continue; // left in source label for manual attention, matching Node behavior
      }

      if (details.isCancellation) {
        await this.processCancellation(gmailMessageId, details, emailMetadata, stats);
      } else {
        await this.processBookingConfirmation(gmailMessageId, details, emailMetadata, stats);
      }

      await this.gmail.moveThread(threadId, this.sourceLabel, this.completedLabel);
      stats.processed++;
    }
  }

  private async processBookingConfirmation(
    gmailMessageId: string,
    details: ReservationDetails,
    emailMetadata: { subject: string; date: string },
    stats: CycleStats,
  ): Promise<void> {
    try {
      log('INFO', `Processing ${this.sourceType} booking confirmation`, {
        date: details.date,
        startTime: details.startTime,
      });

      const { customer, isNew } = await this.customerService.getOrCreateCustomer({
        name: details.customerName,
        phone: details.customerPhone,
        email: details.customerEmail,
      }, this.allowFuzzyNameMatching());

      const isNewCustomer = isNew || !(await this.bookingService.hasBookingHistory(customer.id));

      const startTime24h = parseTimeToStandard(details.startTime);
      const { available, bay } = await this.bookingService.checkAvailability(
        details.date, startTime24h, details.duration, details.numberOfPeople,
      );

      if (!available) {
        log('WARN', `No bays available for ${this.sourceType} booking`, {
          date: details.date,
          startTime: startTime24h,
        });
        await this.line.sendNoSlotsAvailable({
          customerName: details.customerName,
          customerPhone: details.customerPhone || 'N/A',
          date: details.date,
          startTime: startTime24h,
          duration: details.duration,
          numberOfPeople: details.numberOfPeople,
          channel: this.channel,
        });
        await this.emailTracking.markProcessed(gmailMessageId, this.sourceType, 'no_slots', null, null, emailMetadata);
        stats.noSlots++;
        return;
      }

      const booking = await this.bookingService.createBooking({
        customerId: customer.id,
        customerName: customer.customer_name,
        customerPhone: customer.contact_number,
        customerEmail: customer.email,
        date: details.date,
        startTime: startTime24h,
        duration: details.duration,
        numberOfPeople: details.numberOfPeople,
        bay,
        customerContactedVia: this.channel,
        reservationKey: this.reservationKeySupported() ? details.reservationKey : null,
        customerNotes: this.bookingNotes(),
        isNewCustomer,
      });

      await this.line.sendBookingCreated({
        bookingId: booking.id,
        customerName: booking.name,
        customerPhone: booking.phone_number,
        customerEmail: booking.email,
        date: booking.date,
        startTime: booking.start_time,
        duration: booking.duration,
        bay: booking.bay,
        numberOfPeople: booking.number_of_people,
        channel: this.channel,
        isNewCustomer,
        notes: this.lineNotes(),
      });

      await this.emailTracking.markProcessed(gmailMessageId, this.sourceType, 'booking_created', booking.id, null, emailMetadata);
      stats.bookingsCreated++;
    } catch (error) {
      await this.handleProcessingError(gmailMessageId, error, emailMetadata, stats);
    }
  }

  private async processCancellation(
    gmailMessageId: string,
    details: ReservationDetails,
    emailMetadata: { subject: string; date: string },
    stats: CycleStats,
  ): Promise<void> {
    try {
      log('INFO', `Processing ${this.sourceType} cancellation`, { date: details.date });

      let booking = null;
      if (this.reservationKeySupported() && details.reservationKey) {
        booking = await this.bookingService.findBookingByReservationKey(details.reservationKey);
      }
      if (!booking) {
        const startTime24h = parseTimeToStandard(details.startTime);
        booking = await this.bookingService.findBookingByDetails(
          details.customerName, details.customerPhone, details.customerEmail,
          details.date, startTime24h, null,
        );
      }

      if (!booking) {
        log('WARN', `No matching booking found for ${this.sourceType} cancellation`, {
          date: details.date,
          startTime: details.startTime,
        });
        await this.emailTracking.markProcessed(
          gmailMessageId, this.sourceType, 'error', null,
          'No matching booking found for cancellation', emailMetadata,
        );
        stats.errors++;
        return;
      }

      const cancelled = await this.bookingService.cancelBooking(
        booking.id, `Customer cancelled via ${this.channel}`, 'Email Automation',
      );

      await this.line.sendBookingCancelled({
        bookingId: cancelled.id,
        customerName: cancelled.name,
        customerPhone: cancelled.phone_number,
        date: cancelled.date,
        startTime: cancelled.start_time,
        duration: cancelled.duration,
        bay: cancelled.bay,
        numberOfPeople: cancelled.number_of_people,
        channel: this.channel,
        cancelledBy: 'Email Automation',
        cancellationReason: `Customer cancelled via ${this.channel}`,
      });

      await this.emailTracking.markProcessed(gmailMessageId, this.sourceType, 'booking_cancelled', cancelled.id, null, emailMetadata);
      stats.bookingsCancelled++;
    } catch (error) {
      await this.handleProcessingError(gmailMessageId, error, emailMetadata, stats);
    }
  }

  /**
   * Transient errors (network, timeout, 5xx, rate limit) re-throw without
   * marking the email processed, so the next cycle retries it and the thread
   * stays in the source label. Permanent errors are recorded so the email is
   * not retried forever.
   */
  private async handleProcessingError(
    gmailMessageId: string,
    error: unknown,
    emailMetadata: { subject: string; date: string },
    stats: CycleStats,
  ): Promise<void> {
    const message = (error as Error).message || String(error);
    if (isTransientError(error)) {
      log('WARN', 'Transient error encountered, will retry on next cycle', { gmailMessageId, error: message });
      throw error;
    }
    log('ERROR', `Permanent error processing ${this.sourceType} email`, { gmailMessageId, error: message });
    await this.emailTracking.markProcessed(gmailMessageId, this.sourceType, 'error', null, message, emailMetadata);
    stats.errors++;
    // Swallow after recording: the thread is moved to completed by the caller,
    // matching the Node processors (markProcessed then continue).
  }
}

// ---------------------------------------------------------------------------
// ClassPass
// ---------------------------------------------------------------------------

export class ClassPassProcessor extends BaseProcessor {
  protected allowFuzzyNameMatching(): boolean { return true; }
  protected reservationKeySupported(): boolean { return true; }
  protected bookingNotes(): string {
    return 'Booking created automatically from ClassPass email. No payment required at location.';
  }
  protected lineNotes(): string {
    return 'Booking created automatically. ClassPass booking, no payment required at the location.';
  }

  protected extractDetails(bodyText: string, subject: string): ReservationDetails | null {
    // Confirmation subjects: "ClassPass user reservation" / "You received a ClassPass reservation"
    // Cancellation subjects: "ClassPass reservation canceled by user"
    const isCancellation = /canceled by user/i.test(subject) ||
      /reservation canceled/i.test(subject) ||
      /cancelled by user/i.test(subject) ||
      (/cancel/i.test(subject) && !/received/i.test(subject));

    // Old format: "at LenGolf January 15, 2025 @ 2:00 PM"
    // New format: "Date and time\nJan 11, 2026 @\n11:00 AM"
    let dateTimeMatch = bodyText.match(/at LenGolf\s*(\w+ \d{1,2}, \d{4})\s*@\s*(\d{1,2}:\d{2}\s*[APM]{2})/i);
    if (!dateTimeMatch) {
      dateTimeMatch = bodyText.match(/Date\s+and\s+time\s*(\w+\s+\d{1,2},?\s+\d{4})\s*@?\s*(\d{1,2}:\d{2}\s*[APM]{2})/i);
    }
    if (!dateTimeMatch) {
      log('WARN', 'Could not extract date/time from ClassPass email', { subject });
      return null;
    }
    const [, reservationDate, reservationTime] = dateTimeMatch;

    const date = parseMonthNameDate(reservationDate);
    if (!date) {
      log('WARN', 'Could not parse ClassPass reservation date', { reservationDate });
      return null;
    }

    // Old format: "Reservation made by: Name: John Doe"
    // New format: "Member information\n<name lines>\n<email>"
    let customerName: string | null = null;
    const nameMatch = bodyText.match(/(?:Reservation made by:|Name:)\s*(?:Name:)?\s*([^\r\n]+?)(?:\s+Email:|$)/i);
    if (nameMatch) {
      customerName = nameMatch[1].trim();
    } else {
      const memberInfoMatch = bodyText.match(/Member\s+information\s*([\s\S]+?)(?=\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (memberInfoMatch) {
        customerName = memberInfoMatch[1].replace(/\s+/g, ' ').trim();
      }
    }
    if (!customerName) {
      log('WARN', 'Could not extract customer name from ClassPass email', { subject });
      return null;
    }

    let emailMatch = bodyText.match(/Email:\s*([^\s\r\n]+@[^\s\r\n]+)/i);
    if (!emailMatch) {
      emailMatch = bodyText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    }
    const customerEmail = emailMatch ? emailMatch[1].trim() : null;

    const phoneMatch = bodyText.match(/Phone:\s*(\+?[\d\s-]+)/i);
    const customerPhone = phoneMatch ? phoneMatch[1].trim() : null;

    // Old format: "Reservation ID: ABC123"; new format: "Reservation ID #380460658"
    let reservationKeyMatch = bodyText.match(/(?:Reservation|Booking)\s+(?:ID|Key|#):\s*([A-Z0-9-]+)/i);
    if (!reservationKeyMatch) {
      reservationKeyMatch = bodyText.match(/Reservation\s+ID\s*#?(\d+)/i);
    }
    const reservationKey = reservationKeyMatch ? reservationKeyMatch[1].trim() : null;

    const peopleMatch = bodyText.match(/(?:Number of (?:People|Guests|Participants)|Pax):\s*(\d+)/i);
    const numberOfPeople = peopleMatch ? parseInt(peopleMatch[1], 10) : 1;

    return {
      isCancellation,
      date,
      startTime: reservationTime,
      duration: 1, // ClassPass sessions are 1 hour
      customerName,
      customerEmail,
      customerPhone,
      numberOfPeople,
      reservationKey,
    };
  }
}

// ---------------------------------------------------------------------------
// ResOS
// ---------------------------------------------------------------------------

export class WebResosProcessor extends BaseProcessor {
  protected allowFuzzyNameMatching(): boolean { return false; } // phone is always present
  protected reservationKeySupported(): boolean { return false; }
  protected bookingNotes(): string {
    return 'Booking created automatically from ResOS email. Please confirm with customer.';
  }
  protected lineNotes(): string {
    return 'Booking created automatically. Please call customer to confirm.';
  }

  protected extractDetails(bodyText: string, subject: string): ReservationDetails | null {
    const isCancellation = /cancel/i.test(subject) || /cancel/i.test(bodyText);

    // "Date Monday, 1 December 2025"
    const dateMatch = bodyText.match(/Date\s*(.*?\d{4})/i);
    if (!dateMatch) {
      log('WARN', 'Could not extract date from ResOS email', { subject });
      return null;
    }

    // "Time 12:00 - 13:00" or "Time 12:00 PM - 1:00 PM"
    const timeMatch = bodyText.match(/Time\s*(\d{1,2}:\d{2}(?:\s?[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s?[AP]M)?)/i);
    if (!timeMatch) {
      log('WARN', 'Could not extract time from ResOS email', { subject });
      return null;
    }

    const peopleMatch = bodyText.match(/People\s*(\d+)/i);
    if (!peopleMatch) {
      log('WARN', 'Could not extract number of people from ResOS email', { subject });
      return null;
    }

    const nameMatch = bodyText.match(/Name\s*(.*?)(?=\s+(?:Phone|Email))/i);
    if (!nameMatch) {
      log('WARN', 'Could not extract name from ResOS email', { subject });
      return null;
    }

    const phoneMatch = bodyText.match(/Phone\s*(\+\d+\s*\d+\s*\d+\s*\d+)/i);
    if (!phoneMatch) {
      log('WARN', 'Could not extract phone from ResOS email', { subject });
      return null;
    }

    const emailMatch = bodyText.match(/Email\s*([^\s\r\n]+@[^\s\r\n]+)/i);
    const customerEmail = emailMatch ? emailMatch[1].trim() : null;

    // "Monday, 1 December 2025" -> "2025-12-01" (explicit month-name parse; no Date())
    const dateParts = dateMatch[1].match(/([^,]+),\s*(\d+)\s+([^\s]+)\s+(\d{4})/);
    if (!dateParts) {
      log('WARN', 'Could not parse date format from ResOS email', { dateString: dateMatch[1] });
      return null;
    }
    const [, , day, monthName, year] = dateParts;
    const date = parseMonthNameDate(`${monthName} ${day}, ${year}`);
    if (!date) {
      log('WARN', 'Unknown month name in ResOS email date', { monthName });
      return null;
    }

    const startTime = timeMatch[1].trim();
    const endTime = timeMatch[2].trim();

    const start24 = parseTimeToStandard(startTime);
    const end24 = parseTimeToStandard(endTime);
    const [sh, sm] = start24.split(':').map(Number);
    const [eh, em] = end24.split(':').map(Number);
    let duration = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    // Deviation from Node: overnight ranges (e.g. 23:00 - 00:30) produced a
    // negative duration there; zero-length ranges failed validation. Clamp
    // both to 1 hour so the booking is still created and staff can adjust.
    if (duration <= 0) duration = 1;

    return {
      isCancellation,
      date,
      startTime,
      duration,
      numberOfPeople: parseInt(peopleMatch[1], 10),
      customerName: nameMatch[1].trim(),
      customerPhone: phoneMatch[1].trim(),
      customerEmail,
    };
  }
}

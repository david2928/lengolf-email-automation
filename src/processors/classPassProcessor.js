const { LineNotificationService } = require('../services/lineNotificationService');
const { EmailTrackingService } = require('../services/emailTrackingService');
const { CustomerService } = require('../services/customerService');
const { BookingService } = require('../services/bookingService');
const { extractPlainText, formatDate } = require('../utils/emailUtils');
const { log } = require('../utils/logging');

/**
 * ClassPassProcessor - Processes ClassPass booking and cancellation emails
 *
 * Automatically creates bookings from ClassPass confirmation emails,
 * processes cancellations, and sends formatted LINE notifications.
 */
class ClassPassProcessor {
  constructor(gmailService, supabase) {
    if (!gmailService) {
      throw new Error('Gmail service is required for ClassPassProcessor');
    }
    if (!supabase) {
      throw new Error('Supabase client is required for ClassPassProcessor');
    }

    this.gmail = gmailService;
    this.supabase = supabase;

    // Initialize services
    this.emailTracking = new EmailTrackingService(supabase);
    this.customerService = new CustomerService(supabase);
    this.bookingService = new BookingService(supabase);
    this.lineNotification = new LineNotificationService(
      process.env.LINE_CHANNEL_ACCESS_TOKEN_CLASSPASS || process.env.LINE_CHANNEL_ACCESS_TOKEN,
      process.env.LINE_GROUP_ID_CLASSPASS || process.env.LINE_GROUP_ID,
      'CLASSPASS'
    );

    this.sourceLabel = process.env.LABEL_CLASSPASS;
    this.completedLabel = process.env.LABEL_COMPLETED;
  }

  /**
   * Extract reservation details from ClassPass email
   * @param {string} bodyText - Plain text email body
   * @param {string} subject - Email subject line
   * @returns {object|null} - Extracted booking details or null
   */
  extractReservationDetails(bodyText, subject) {
    try {
      // Detect if this is a cancellation email - look for specific cancellation phrases in subject
      // Confirmation emails have subjects like "ClassPass user reservation" or "You received a ClassPass reservation"
      // Cancellation emails have subjects like "ClassPass reservation canceled by user"
      const isCancellation = /canceled by user/i.test(subject) ||
                            /reservation canceled/i.test(subject) ||
                            /cancelled by user/i.test(subject) ||
                            (/cancel/i.test(subject) && !/received/i.test(subject));

      // Extract date and time: "at LenGolf January 15, 2025 @ 2:00 PM"
      const dateTimeMatch = bodyText.match(/at LenGolf\s*(\w+ \d{1,2}, \d{4})\s*@\s*(\d{1,2}:\d{2}\s*[APM]{2})/i);
      if (!dateTimeMatch) {
        log('WARN', 'Could not extract date/time from ClassPass email', {
          subject,
          bodyPreview: bodyText.substring(0, 200)
        });
        return null;
      }

      const [, reservationDate, reservationTime] = dateTimeMatch;

      // Extract customer name: "Reservation made by: Name: John Doe"
      const nameMatch = bodyText.match(/(?:Reservation made by:|Name:)\s*(?:Name:)?\s*([^\r\n]+?)(?:\s+Email:|$)/i);
      if (!nameMatch) {
        log('WARN', 'Could not extract customer name from ClassPass email');
        return null;
      }

      const customerName = nameMatch[1].trim();

      // Extract email: "Email: john@example.com"
      const emailMatch = bodyText.match(/Email:\s*([^\s\r\n]+@[^\s\r\n]+)/i);
      const customerEmail = emailMatch ? emailMatch[1].trim() : null;

      // Extract phone (if available): "Phone: +66 12 345 6789" or "Phone: 0812345678"
      const phoneMatch = bodyText.match(/Phone:\s*(\+?[\d\s-]+)/i);
      const customerPhone = phoneMatch ? phoneMatch[1].trim() : null;

      // Extract reservation key/ID: "Reservation ID: ABC123" or "Booking ID: XYZ789"
      const reservationKeyMatch = bodyText.match(/(?:Reservation|Booking)\s+(?:ID|Key|#):\s*([A-Z0-9-]+)/i);
      const reservationKey = reservationKeyMatch ? reservationKeyMatch[1].trim() : null;

      // Extract number of people (ClassPass typically 1 person, but check)
      const peopleMatch = bodyText.match(/(?:Number of (?:People|Guests|Participants)|Pax):\s*(\d+)/i);
      const numberOfPeople = peopleMatch ? parseInt(peopleMatch[1], 10) : 1; // Default to 1 for ClassPass

      // Convert date to YYYY-MM-DD format
      const date = new Date(reservationDate);
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD

      // Calculate end time (ClassPass sessions are typically 1 hour)
      const endTime = this.calculateEndTime(reservationTime);

      return {
        isCancellation,
        date: formattedDate,
        reservationDate, // Original formatted date for notifications
        startTime: reservationTime,
        endTime,
        duration: 1, // ClassPass sessions are typically 1 hour
        customerName,
        customerEmail,
        customerPhone,
        numberOfPeople,
        reservationKey
      };
    } catch (error) {
      log('ERROR', 'Failed to extract reservation details from ClassPass email', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Calculate end time (ClassPass sessions are 1 hour)
   * @param {string} startTime - Start time (e.g., "2:00 PM")
   * @returns {string} - End time in same format
   */
  calculateEndTime(startTime) {
    try {
      const [time, period] = startTime.split(' ');
      let [hours, minutes] = time.split(':').map(Number);

      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      hours = (hours + 1) % 24;
      const newPeriod = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${newPeriod}`;
    } catch (error) {
      log('ERROR', 'Failed to calculate end time', { startTime, error: error.message });
      return '';
    }
  }

  /**
   * Process a ClassPass booking confirmation email
   * @param {string} gmailMessageId - Gmail message ID
   * @param {object} details - Extracted booking details
   * @returns {Promise<void>}
   */
  async processBookingConfirmation(gmailMessageId, details, emailMetadata) {
    try {
      log('INFO', 'Processing ClassPass booking confirmation', {
        customerName: details.customerName,
        date: details.date,
        startTime: details.startTime
      });

      // Step 1: Match or create customer (allow fuzzy name matching for ClassPass)
      const { customer, isNew } = await this.customerService.getOrCreateCustomer({
        name: details.customerName,
        phone: details.customerPhone,
        email: details.customerEmail
      }, true); // Allow fuzzy name matching

      log('INFO', isNew ? 'Created new customer' : 'Matched existing customer', {
        customerId: customer.id,
        customerCode: customer.customer_code,
        customerName: customer.customer_name
      });

      // Step 2: Convert start time to HH:mm format (24-hour)
      const startTime24h = this.bookingService.parseTimeToStandard(details.startTime);

      // Step 3: Check bay availability
      const { available, bay } = await this.bookingService.checkAvailability(
        details.date,
        startTime24h,
        details.duration,
        details.numberOfPeople
      );

      if (!available) {
        log('WARN', 'No bays available for ClassPass booking', {
          customerName: details.customerName,
          date: details.date,
          startTime: details.startTime
        });

        // Send "no slots" notification (though unusual for ClassPass)
        await this.lineNotification.sendNoSlotsAvailable({
          customerName: details.customerName,
          customerPhone: details.customerPhone || 'N/A',
          date: details.date,
          startTime: startTime24h,
          duration: details.duration,
          numberOfPeople: details.numberOfPeople,
          channel: 'ClassPass'
        });

        // Track email as processed with "no_slots" action
        await this.emailTracking.markProcessed(
          gmailMessageId,
          'classpass',
          'no_slots',
          null,
          null,
          emailMetadata
        );

        return;
      }

      // Step 4: Create booking
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
        customerContactedVia: 'ClassPass',
        reservationKey: details.reservationKey,
        customerNotes: 'Booking created automatically from ClassPass email. No payment required at location.'
      });

      log('INFO', 'ClassPass booking created successfully', {
        bookingId: booking.id,
        customerName: booking.name,
        bay: booking.bay
      });

      // Step 5: Send LINE notification
      await this.lineNotification.sendBookingCreated({
        bookingId: booking.id,
        customerName: booking.name,
        customerPhone: booking.phone_number,
        customerEmail: booking.email,
        date: booking.date,
        startTime: booking.start_time,
        duration: booking.duration,
        bay: booking.bay,
        numberOfPeople: booking.number_of_people,
        channel: 'ClassPass',
        notes: 'Booking created automatically. ClassPass booking, no payment required at the location.'
      });

      // Step 6: Track email as processed
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'classpass',
        'booking_created',
        booking.id,
        null,
        emailMetadata
      );

      log('INFO', 'ClassPass booking processed successfully', {
        bookingId: booking.id,
        gmailMessageId
      });
    } catch (error) {
      log('ERROR', 'Failed to process ClassPass booking confirmation', {
        customerName: details.customerName,
        error: error.message,
        stack: error.stack
      });

      // Track email as processed with error
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'classpass',
        'error',
        null,
        error.message,
        emailMetadata
      );

      throw error;
    }
  }

  /**
   * Process a ClassPass cancellation email
   * @param {string} gmailMessageId - Gmail message ID
   * @param {object} details - Extracted booking details
   * @returns {Promise<void>}
   */
  async processCancellation(gmailMessageId, details, emailMetadata) {
    try {
      log('INFO', 'Processing ClassPass cancellation', {
        customerName: details.customerName,
        reservationKey: details.reservationKey,
        date: details.date
      });

      // Find booking by reservation key
      let booking = null;

      if (details.reservationKey) {
        booking = await this.bookingService.findBookingByReservationKey(details.reservationKey);
      }

      // If not found by reservation key, try matching by customer details and time
      if (!booking) {
        const startTime24h = this.bookingService.parseTimeToStandard(details.startTime);
        booking = await this.bookingService.findBookingByDetails(
          details.customerName,
          details.customerPhone,
          details.customerEmail,
          details.date,
          startTime24h,
          null // Don't filter by source - find any booking matching customer/time
        );
      }

      if (!booking) {
        log('WARN', 'No matching booking found for ClassPass cancellation', {
          customerName: details.customerName,
          reservationKey: details.reservationKey,
          date: details.date,
          startTime: details.startTime
        });

        // Track email as processed with error
        await this.emailTracking.markProcessed(
          gmailMessageId,
          'classpass',
          'error',
          null,
          'No matching booking found for cancellation',
          emailMetadata
        );

        return;
      }

      // Cancel the booking
      const cancelledBooking = await this.bookingService.cancelBooking(
        booking.id,
        'Customer cancelled via ClassPass',
        'Email Automation'
      );

      log('INFO', 'ClassPass booking cancelled successfully', {
        bookingId: cancelledBooking.id,
        customerName: cancelledBooking.name
      });

      // Send cancellation notification
      await this.lineNotification.sendBookingCancelled({
        bookingId: cancelledBooking.id,
        customerName: cancelledBooking.name,
        customerPhone: cancelledBooking.phone_number,
        date: cancelledBooking.date,
        startTime: cancelledBooking.start_time,
        duration: cancelledBooking.duration,
        bay: cancelledBooking.bay,
        numberOfPeople: cancelledBooking.number_of_people,
        channel: 'ClassPass',
        cancelledBy: 'Email Automation',
        cancellationReason: 'Customer cancelled via ClassPass'
      });

      // Track email as processed
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'classpass',
        'booking_cancelled',
        cancelledBooking.id,
        null,
        emailMetadata
      );

      log('INFO', 'ClassPass cancellation processed successfully', {
        bookingId: cancelledBooking.id,
        gmailMessageId
      });
    } catch (error) {
      log('ERROR', 'Failed to process ClassPass cancellation', {
        customerName: details.customerName,
        error: error.message,
        stack: error.stack
      });

      // Track email as processed with error
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'classpass',
        'error',
        null,
        error.message,
        emailMetadata
      );

      throw error;
    }
  }

  /**
   * Process all ClassPass emails in the inbox
   * @returns {Promise<void>}
   */
  async processEmails() {
    try {
      const threads = await this.gmail.listThreads(this.sourceLabel);
      log('INFO', 'Processing ClassPass threads', { count: threads.length });

      for (const thread of threads) {
        try {
          const messages = await this.gmail.getThreadMessages(thread.id);

          for (const message of messages) {
            const gmailMessageId = message.id;

            // Check if already processed
            const isProcessed = await this.emailTracking.isProcessed(gmailMessageId);
            if (isProcessed) {
              log('DEBUG', 'ClassPass email already processed, skipping', { gmailMessageId });
              await this.gmail.moveThread(thread.id, this.sourceLabel, this.completedLabel);
              continue;
            }

            // Extract email content
            const bodyHtml = await this.gmail.getMessageBody(message.id);
            const bodyText = extractPlainText(bodyHtml);
            const subject = message.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
            const date = message.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

            // Email metadata for tracking
            const emailMetadata = { subject, date };

            // Extract reservation details
            const details = this.extractReservationDetails(bodyText, subject);
            if (!details) {
              log('WARN', 'Could not extract reservation details from ClassPass email', {
                threadId: thread.id,
                messageId: message.id,
                subject
              });
              continue;
            }

            // Process based on type (booking or cancellation)
            if (details.isCancellation) {
              await this.processCancellation(gmailMessageId, details, emailMetadata);
            } else {
              await this.processBookingConfirmation(gmailMessageId, details, emailMetadata);
            }

            // Move thread to completed
            await this.gmail.moveThread(thread.id, this.sourceLabel, this.completedLabel);
          }
        } catch (threadError) {
          log('ERROR', `Error processing ClassPass thread ${thread.id}`, {
            error: threadError.message,
            stack: threadError.stack
          });
          // Continue processing other threads
        }
      }
    } catch (error) {
      log('ERROR', 'Error processing ClassPass emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { ClassPassProcessor };

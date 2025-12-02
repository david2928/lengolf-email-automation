const { LineNotificationService } = require('../services/lineNotificationService');
const { EmailTrackingService } = require('../services/emailTrackingService');
const { CustomerService } = require('../services/customerService');
const { BookingService } = require('../services/bookingService');
const { extractPlainText, formatDate, parseTime } = require('../utils/emailUtils');
const { log } = require('../utils/logging');

/**
 * WebResosProcessor - Processes ResOS reservation emails
 *
 * Automatically creates bookings from ResOS confirmation emails,
 * processes cancellations, and sends formatted LINE notifications.
 * Includes staff confirmation note when slots are available.
 */
class WebResosProcessor {
  constructor(gmailService, supabase) {
    if (!gmailService) {
      throw new Error('Gmail service is required for WebResosProcessor');
    }
    if (!supabase) {
      throw new Error('Supabase client is required for WebResosProcessor');
    }

    this.gmail = gmailService;
    this.supabase = supabase;

    // Initialize services
    this.emailTracking = new EmailTrackingService(supabase);
    this.customerService = new CustomerService(supabase);
    this.bookingService = new BookingService(supabase);
    this.lineNotification = new LineNotificationService(
      process.env.LINE_CHANNEL_ACCESS_TOKEN_WEBRESOS || process.env.LINE_CHANNEL_ACCESS_TOKEN,
      process.env.LINE_GROUP_ID_WEBRESOS || process.env.LINE_GROUP_ID,
      'RESOS'
    );

    this.sourceLabels = [process.env.LABEL_RESOS];
    this.completedLabel = process.env.LABEL_COMPLETED;
  }

  /**
   * Extract ResOS booking data from email
   * @param {string} bodyText - Plain text email body
   * @param {string} subject - Email subject line
   * @returns {object|null} - Extracted booking data or null
   */
  extractResOSData(bodyText, subject) {
    try {
      // Detect if this is a cancellation email
      const isCancellation = /cancel/i.test(subject) || /cancel/i.test(bodyText);

      log('DEBUG', 'Processing ResOS email body text', { bodyText });

      // Extract date: "Date Monday, 1 December 2025"
      const dateMatch = bodyText.match(/Date\s*(.*?\d{4})/i);
      if (!dateMatch) {
        log('WARN', 'Could not extract date from ResOS email', { subject });
        return null;
      }

      // Extract time: "Time 12:00 - 13:00" or "Time 12:00 PM - 1:00 PM"
      // Handle both 24-hour format and 12-hour format
      const timeMatch = bodyText.match(/Time\s*(\d{1,2}:\d{2}(?:\s?[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s?[AP]M)?)/i);
      if (!timeMatch) {
        log('WARN', 'Could not extract time from ResOS email', { subject });
        return null;
      }

      // Extract number of people: "People 4"
      const peopleMatch = bodyText.match(/People\s*(\d+)/i);
      if (!peopleMatch) {
        log('WARN', 'Could not extract number of people from ResOS email', { subject });
        return null;
      }

      // Extract name: "Name John Doe"
      const nameMatch = bodyText.match(/Name\s*(.*?)(?=\s+(?:Phone|Email))/i);
      if (!nameMatch) {
        log('WARN', 'Could not extract name from ResOS email', { subject });
        return null;
      }

      // Extract phone: "Phone +66 12 345 6789"
      const phoneMatch = bodyText.match(/Phone\s*(\+\d+\s*\d+\s*\d+\s*\d+)/i);
      if (!phoneMatch) {
        log('WARN', 'Could not extract phone from ResOS email', { subject });
        return null;
      }

      // Extract email (optional): "Email john@example.com"
      const emailMatch = bodyText.match(/Email\s*([^\s\r\n]+@[^\s\r\n]+)/i);
      const customerEmail = emailMatch ? emailMatch[1].trim() : null;

      // Parse date to YYYY-MM-DD format
      // "Monday, 1 December 2025" -> "2025-12-01"
      const dateParts = dateMatch[1].match(/([^,]+),\s*(\d+)\s+([^\s]+)\s+(\d{4})/);
      if (!dateParts) {
        log('WARN', 'Could not parse date format from ResOS email', { dateString: dateMatch[1] });
        return null;
      }

      const [, weekday, day, monthName, year] = dateParts;
      const monthMap = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12'
      };
      const month = monthMap[monthName.toLowerCase()];
      const formattedDate = `${year}-${month}-${day.padStart(2, '0')}`; // YYYY-MM-DD

      // Parse start and end time
      const startTime = timeMatch[1].trim();
      const endTime = timeMatch[2].trim();

      // Calculate duration in hours
      const duration = this.calculateDuration(startTime, endTime);

      return {
        isCancellation,
        date: formattedDate,
        displayDate: `${weekday}, ${day} ${monthName}`, // For notifications
        startTime,
        endTime,
        duration,
        numberOfPeople: parseInt(peopleMatch[1], 10),
        customerName: nameMatch[1].trim(),
        customerPhone: phoneMatch[1].trim(),
        customerEmail
      };
    } catch (error) {
      log('ERROR', 'Error extracting ResOS data', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Calculate duration in hours from start and end time
   * @param {string} startTime - Start time (12 or 24 hour format)
   * @param {string} endTime - End time (12 or 24 hour format)
   * @returns {number} - Duration in hours
   */
  calculateDuration(startTime, endTime) {
    try {
      // Convert to 24-hour format
      const start24 = this.convertTo24Hour(startTime);
      const end24 = this.convertTo24Hour(endTime);

      const [startHours, startMinutes] = start24.split(':').map(Number);
      const [endHours, endMinutes] = end24.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      const durationMinutes = endTotalMinutes - startTotalMinutes;
      return durationMinutes / 60; // Convert to hours
    } catch (error) {
      log('ERROR', 'Failed to calculate duration', { startTime, endTime, error: error.message });
      return 1; // Default to 1 hour
    }
  }

  /**
   * Convert time to 24-hour format
   * @param {string} timeString - Time in 12 or 24 hour format
   * @returns {string} - Time in HH:mm format
   */
  convertTo24Hour(timeString) {
    try {
      // Check if already in 24-hour format (no AM/PM)
      if (!/[AP]M/i.test(timeString)) {
        // Already 24-hour format, just normalize
        const [hours, minutes] = timeString.split(':');
        return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      }

      // Parse 12-hour format
      const match = timeString.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
      if (!match) {
        log('WARN', 'Could not parse time format', { timeString });
        return timeString;
      }

      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = match[3].toUpperCase();

      if (period === 'PM' && hours < 12) {
        hours += 12;
      }
      if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      return `${String(hours).padStart(2, '0')}:${minutes}`;
    } catch (error) {
      log('ERROR', 'Failed to convert time to 24-hour format', { timeString, error: error.message });
      return timeString;
    }
  }

  /**
   * Process a ResOS booking confirmation email
   * @param {string} gmailMessageId - Gmail message ID
   * @param {object} bookingData - Extracted booking data
   * @param {object} emailMetadata - Email metadata for tracking
   * @returns {Promise<void>}
   */
  async processBookingConfirmation(gmailMessageId, bookingData, emailMetadata) {
    try {
      log('INFO', 'Processing ResOS booking confirmation', {
        customerName: bookingData.customerName,
        date: bookingData.date,
        startTime: bookingData.startTime
      });

      // Step 1: Match or create customer (no fuzzy matching for ResOS since we have phone)
      const { customer, isNew } = await this.customerService.getOrCreateCustomer({
        name: bookingData.customerName,
        phone: bookingData.customerPhone,
        email: bookingData.customerEmail
      }, false); // No fuzzy matching for ResOS

      log('INFO', isNew ? 'Created new customer' : 'Matched existing customer', {
        customerId: customer.id,
        customerCode: customer.customer_code,
        customerName: customer.customer_name
      });

      // Step 2: Convert start time to HH:mm format (24-hour)
      const startTime24h = this.convertTo24Hour(bookingData.startTime);

      // Step 3: Check bay availability
      const { available, bay } = await this.bookingService.checkAvailability(
        bookingData.date,
        startTime24h,
        bookingData.duration,
        bookingData.numberOfPeople
      );

      if (!available) {
        log('WARN', 'No bays available for ResOS booking', {
          customerName: bookingData.customerName,
          date: bookingData.date,
          startTime: bookingData.startTime
        });

        // Send "no slots" notification
        await this.lineNotification.sendNoSlotsAvailable({
          customerName: bookingData.customerName,
          customerPhone: bookingData.customerPhone,
          date: bookingData.date,
          startTime: startTime24h,
          duration: bookingData.duration,
          numberOfPeople: bookingData.numberOfPeople,
          channel: 'ResOS'
        });

        // Track email as processed with "no_slots" action
        await this.emailTracking.markProcessed(
          gmailMessageId,
          'resos',
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
        date: bookingData.date,
        startTime: startTime24h,
        duration: bookingData.duration,
        numberOfPeople: bookingData.numberOfPeople,
        bay,
        customerContactedVia: 'ResOS',
        customerNotes: 'Booking created automatically from ResOS email. Please confirm with customer.'
      });

      log('INFO', 'ResOS booking created successfully', {
        bookingId: booking.id,
        customerName: booking.name,
        bay: booking.bay
      });

      // Step 5: Send LINE notification with staff confirmation note
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
        channel: 'ResOS',
        notes: 'Booking created automatically. Please call customer to confirm.'
      });

      // Step 6: Track email as processed
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'resos',
        'booking_created',
        booking.id,
        null,
        emailMetadata
      );

      log('INFO', 'ResOS booking processed successfully', {
        bookingId: booking.id,
        gmailMessageId
      });
    } catch (error) {
      log('ERROR', 'Failed to process ResOS booking confirmation', {
        customerName: bookingData.customerName,
        error: error.message,
        stack: error.stack
      });

      // Track email as processed with error
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'resos',
        'error',
        null,
        error.message,
        emailMetadata
      );

      throw error;
    }
  }

  /**
   * Process a ResOS cancellation email
   * @param {string} gmailMessageId - Gmail message ID
   * @param {object} bookingData - Extracted booking data
   * @param {object} emailMetadata - Email metadata for tracking
   * @returns {Promise<void>}
   */
  async processCancellation(gmailMessageId, bookingData, emailMetadata) {
    try {
      log('INFO', 'Processing ResOS cancellation', {
        customerName: bookingData.customerName,
        date: bookingData.date,
        startTime: bookingData.startTime
      });

      // Find booking by customer details and time
      const startTime24h = this.convertTo24Hour(bookingData.startTime);
      const booking = await this.bookingService.findBookingByDetails(
        bookingData.customerName,
        bookingData.customerPhone,
        bookingData.customerEmail,
        bookingData.date,
        startTime24h,
        'ResOS'
      );

      if (!booking) {
        log('WARN', 'No matching booking found for ResOS cancellation', {
          customerName: bookingData.customerName,
          date: bookingData.date,
          startTime: bookingData.startTime
        });

        // Track email as processed with error
        await this.emailTracking.markProcessed(
          gmailMessageId,
          'resos',
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
        'Customer cancelled via ResOS',
        'Email Automation'
      );

      log('INFO', 'ResOS booking cancelled successfully', {
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
        channel: 'ResOS',
        cancelledBy: 'Email Automation',
        cancellationReason: 'Customer cancelled via ResOS'
      });

      // Track email as processed
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'resos',
        'booking_cancelled',
        cancelledBooking.id,
        null,
        emailMetadata
      );

      log('INFO', 'ResOS cancellation processed successfully', {
        bookingId: cancelledBooking.id,
        gmailMessageId
      });
    } catch (error) {
      log('ERROR', 'Failed to process ResOS cancellation', {
        customerName: bookingData.customerName,
        error: error.message,
        stack: error.stack
      });

      // Track email as processed with error
      await this.emailTracking.markProcessed(
        gmailMessageId,
        'resos',
        'error',
        null,
        error.message,
        emailMetadata
      );

      throw error;
    }
  }

  /**
   * Process all ResOS emails in the inbox
   * @returns {Promise<void>}
   */
  async processEmails() {
    try {
      for (const sourceLabel of this.sourceLabels) {
        const threads = await this.gmail.listThreads(sourceLabel);
        log('INFO', `Processing threads from ${sourceLabel}`, { count: threads.length });

        for (const thread of threads) {
          try {
            const messages = await this.gmail.getThreadMessages(thread.id);

            for (const message of messages) {
              const gmailMessageId = message.id;

              // Check if already processed
              const isProcessed = await this.emailTracking.isProcessed(gmailMessageId);
              if (isProcessed) {
                log('DEBUG', 'ResOS email already processed, skipping', { gmailMessageId });
                await this.gmail.moveThread(thread.id, sourceLabel, this.completedLabel);
                continue;
              }

              // Extract email content
              const bodyHtml = await this.gmail.getMessageBody(message.id);
              const bodyText = extractPlainText(bodyHtml);
              const subject = message.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
              const date = message.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

              log('DEBUG', 'Processing ResOS message body', {
                messageId: message.id,
                bodyText
              });

              // Email metadata for tracking
              const emailMetadata = { subject, date };

              // Extract booking data
              const bookingData = this.extractResOSData(bodyText, subject);

              if (bookingData) {
                // Process based on type (booking or cancellation)
                if (bookingData.isCancellation) {
                  await this.processCancellation(gmailMessageId, bookingData, emailMetadata);
                } else {
                  await this.processBookingConfirmation(gmailMessageId, bookingData, emailMetadata);
                }

                // Move thread to completed
                await this.gmail.moveThread(thread.id, sourceLabel, this.completedLabel);

                log('INFO', 'Processed ResOS booking', {
                  customer: bookingData.customerName,
                  date: bookingData.date,
                  time: bookingData.startTime,
                  people: bookingData.numberOfPeople
                });
              } else {
                log('WARNING', 'Could not extract booking data from ResOS message', {
                  messageId: message.id,
                  subject
                });
              }
            }
          } catch (threadError) {
            log('ERROR', `Error processing thread ${thread.id}`, {
              error: threadError.message,
              stack: threadError.stack
            });
          }
        }
      }
    } catch (error) {
      log('ERROR', 'Error processing ResOS emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { WebResosProcessor };

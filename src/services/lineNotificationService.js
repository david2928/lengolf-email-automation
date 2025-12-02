const { LineMessagingService } = require('../utils/lineMessaging');
const { log } = require('../utils/logging');

/**
 * LineNotificationService - Formats and sends LINE notifications for booking events
 *
 * Formats notifications to match the lengolf-forms notification format with
 * support for booking creation, cancellation, and "no slots" scenarios.
 * Integrates with the existing LINE Messaging API infrastructure.
 */
class LineNotificationService {
  constructor(lineChannelToken, lineGroupId, serviceType) {
    if (!lineChannelToken || !lineGroupId) {
      throw new Error('LINE channel token and group ID are required for LineNotificationService');
    }

    this.lineMessaging = new LineMessagingService(
      lineChannelToken,
      lineGroupId,
      serviceType || 'EMAIL_AUTOMATION'
    );
  }

  /**
   * Format date to "Weekday, Day Month" format (e.g., "Monday, 1 December")
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @returns {string} - Formatted date
   */
  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      const weekday = date.toLocaleDateString("en-US", { weekday: 'long' });
      const day = date.getDate();
      const month = date.toLocaleDateString("en-US", { month: 'long' });
      return `${weekday}, ${day} ${month}`;
    } catch (error) {
      log('WARN', 'Failed to format date', { dateString, error: error.message });
      return dateString; // Return original if parsing fails
    }
  }

  /**
   * Format time to "H:mm AM/PM" format (e.g., "2:00 PM")
   * Accepts both 12-hour and 24-hour formats
   * @param {string} timeString - Time in HH:mm format (24-hour)
   * @returns {string} - Formatted time in 12-hour format
   */
  formatTime(timeString) {
    try {
      // Parse HH:mm format (24-hour)
      const [hours, minutes] = timeString.split(':').map(Number);

      // Convert to 12-hour format
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12; // 0 becomes 12

      return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
    } catch (error) {
      log('WARN', 'Failed to format time', { timeString, error: error.message });
      return timeString; // Return original if parsing fails
    }
  }

  /**
   * Calculate end time from start time and duration
   * @param {string} startTime - Start time in HH:mm format (24-hour)
   * @param {number} duration - Duration in hours
   * @returns {string} - End time in 12-hour format
   */
  calculateEndTime(startTime, duration) {
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const durationMinutes = Math.round(duration * 60);
      const endMinutes = startMinutes + durationMinutes;

      const endHours = Math.floor(endMinutes / 60) % 24;
      const endMins = endMinutes % 60;

      return this.formatTime(`${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`);
    } catch (error) {
      log('ERROR', 'Failed to calculate end time', {
        startTime,
        duration,
        error: error.message
      });
      return '';
    }
  }

  /**
   * Format booking created notification (plain text format)
   * @param {object} bookingData - Booking information
   * @returns {string} - Formatted LINE message
   */
  formatBookingCreatedNotification(bookingData) {
    const {
      bookingId,
      customerName,
      customerPhone,
      customerEmail,
      date,
      startTime,
      duration,
      bay,
      numberOfPeople,
      channel,
      notes
    } = bookingData;

    // Format date and times
    const formattedDate = this.formatDate(date);
    const formattedStartTime = this.formatTime(startTime);
    const formattedEndTime = this.calculateEndTime(startTime, duration);

    // Build notification message (matches lengolf-forms format)
    let message = `Booking Notification (ID: ${bookingId})\n`;
    message += `Name: ${customerName}\n`;
    message += `Phone: ${customerPhone}\n`;

    if (customerEmail) {
      message += `Email: ${customerEmail}\n`;
    }

    message += `Date: ${formattedDate}\n`;
    message += `Time: ${formattedStartTime} - ${formattedEndTime}\n`;
    message += `Bay: ${bay}\n`;
    message += `People: ${numberOfPeople}\n`;
    message += `Channel: ${channel}`;

    // Add notes if provided
    if (notes) {
      message += `\n\nNote: ${notes}`;
    }

    return message;
  }

  /**
   * Format booking cancelled notification (emoji format)
   * @param {object} bookingData - Booking information
   * @returns {string} - Formatted LINE message
   */
  formatBookingCancelledNotification(bookingData) {
    const {
      bookingId,
      customerName,
      customerPhone,
      date,
      startTime,
      duration,
      bay,
      numberOfPeople,
      channel,
      cancelledBy,
      cancellationReason
    } = bookingData;

    // Format date and times
    const formattedDate = this.formatDate(date);
    const formattedStartTime = this.formatTime(startTime);
    const durationHours = duration ? `${duration}h` : '';

    // Build cancellation message (matches lengolf-forms emoji format)
    let message = `🚫 BOOKING CANCELLED (ID: ${bookingId}) 🚫\n`;
    message += `----------------------------------\n`;
    message += `👤 Customer: ${customerName}\n`;
    message += `📞 Phone: ${customerPhone}\n`;
    message += `🗓️ Date: ${formattedDate}\n`;
    message += `⏰ Time: ${formattedStartTime}${durationHours ? ` (Duration: ${durationHours})` : ''}\n`;
    message += `⛳ Bay: ${bay}\n`;
    message += `🧑‍🤝‍🧑 Pax: ${numberOfPeople}\n`;
    message += `📍 Channel: ${channel}\n`;
    message += `----------------------------------\n`;
    message += `🗑️ Cancelled By: ${cancelledBy || 'Email Automation'}\n`;

    if (cancellationReason) {
      message += `💬 Reason: ${cancellationReason}`;
    }

    return message;
  }

  /**
   * Format "no slots available" notification (for ResOS)
   * @param {object} bookingData - Booking request information
   * @returns {string} - Formatted LINE message
   */
  formatNoSlotsNotification(bookingData) {
    const {
      customerName,
      customerPhone,
      date,
      startTime,
      duration,
      numberOfPeople,
      channel
    } = bookingData;

    // Format date and times
    const formattedDate = this.formatDate(date);
    const formattedStartTime = this.formatTime(startTime);
    const formattedEndTime = this.calculateEndTime(startTime, duration);

    // Use the current ResOS/Website format with "NO SLOTS AVAILABLE" note
    const message = `[New ${channel} Booking] ` +
      `Customer ${customerName} ` +
      `(${customerPhone}), ` +
      `${numberOfPeople} PAX on ` +
      `${formattedDate} from ` +
      `${formattedStartTime} - ${formattedEndTime}. ` +
      `Please check bay availability and call back customer to confirm and submit booking form.\n\n` +
      `⚠️ NO SLOTS AVAILABLE - Manual handling required.`;

    return message;
  }

  /**
   * Send booking created notification
   * @param {object} bookingData - Booking information
   * @returns {Promise<void>}
   */
  async sendBookingCreated(bookingData) {
    try {
      const message = this.formatBookingCreatedNotification(bookingData);

      log('DEBUG', 'Sending booking created notification', {
        bookingId: bookingData.bookingId,
        channel: bookingData.channel,
        messageLength: message.length
      });

      await this.lineMessaging.send(message);

      log('INFO', 'Booking created notification sent', {
        bookingId: bookingData.bookingId,
        customerName: bookingData.customerName
      });
    } catch (error) {
      log('ERROR', 'Failed to send booking created notification', {
        bookingData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send booking cancelled notification
   * @param {object} bookingData - Booking information
   * @returns {Promise<void>}
   */
  async sendBookingCancelled(bookingData) {
    try {
      const message = this.formatBookingCancelledNotification(bookingData);

      log('DEBUG', 'Sending booking cancelled notification', {
        bookingId: bookingData.bookingId,
        channel: bookingData.channel,
        messageLength: message.length
      });

      await this.lineMessaging.send(message);

      log('INFO', 'Booking cancelled notification sent', {
        bookingId: bookingData.bookingId,
        customerName: bookingData.customerName
      });
    } catch (error) {
      log('ERROR', 'Failed to send booking cancelled notification', {
        bookingData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send "no slots available" notification
   * @param {object} bookingData - Booking request information
   * @returns {Promise<void>}
   */
  async sendNoSlotsAvailable(bookingData) {
    try {
      const message = this.formatNoSlotsNotification(bookingData);

      log('DEBUG', 'Sending no slots available notification', {
        customerName: bookingData.customerName,
        channel: bookingData.channel,
        messageLength: message.length
      });

      await this.lineMessaging.send(message);

      log('INFO', 'No slots available notification sent', {
        customerName: bookingData.customerName,
        date: bookingData.date
      });
    } catch (error) {
      log('ERROR', 'Failed to send no slots notification', {
        bookingData,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { LineNotificationService };

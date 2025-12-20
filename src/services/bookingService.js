const { log } = require('../utils/logging');

/**
 * BookingService - Handles booking operations
 *
 * Provides methods for creating, cancelling, and managing bookings
 * including availability checking and bay assignment.
 */
class BookingService {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('Supabase client is required for BookingService');
    }
    this.supabase = supabase;

    // Bay configuration
    this.BAYS = {
      SOCIAL: ['Bay 2', 'Bay 3', 'Bay 1'], // Preference order (Bay 1 is Bar)
      AI: ['Bay 4']
    };
    this.MAX_PEOPLE_SOCIAL = 5;
    this.MAX_PEOPLE_AI = 2; // Bay 4 allows up to 2 players
  }

  /**
   * Parse time string to HH:mm format (24-hour)
   * Supports both 12-hour (2:00 PM) and 24-hour (14:00) formats
   * @param {string} timeString - Time string
   * @returns {string} - Time in HH:mm format
   */
  parseTimeToStandard(timeString) {
    try {
      // Remove extra whitespace
      const cleaned = timeString.trim();

      // Check if it's 12-hour format (has AM/PM)
      const is12Hour = /[AP]M/i.test(cleaned);

      if (is12Hour) {
        // Parse 12-hour format (e.g., "2:00 PM")
        const match = cleaned.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
        if (!match) {
          throw new Error(`Invalid 12-hour time format: ${timeString}`);
        }

        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const period = match[3].toUpperCase();

        // Convert to 24-hour
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }

        return `${String(hours).padStart(2, '0')}:${minutes}`;
      } else {
        // Assume 24-hour format (e.g., "14:00")
        const match = cleaned.match(/(\d{1,2}):(\d{2})/);
        if (!match) {
          throw new Error(`Invalid time format: ${timeString}`);
        }

        const hours = parseInt(match[1], 10);
        const minutes = match[2];

        if (hours < 0 || hours > 23) {
          throw new Error(`Invalid hour value: ${hours}`);
        }

        return `${String(hours).padStart(2, '0')}:${minutes}`;
      }
    } catch (error) {
      log('ERROR', 'Failed to parse time', {
        timeString,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate end time from start time and duration
   * @param {string} startTime - Start time in HH:mm format
   * @param {number} duration - Duration in hours (can be decimal)
   * @returns {string} - End time in HH:mm format
   */
  calculateEndTime(startTime, duration) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const durationMinutes = Math.round(duration * 60);
    const endMinutes = startMinutes + durationMinutes;

    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = endMinutes % 60;

    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  }

  /**
   * Check if a specific bay is available for the given time slot
   * @param {string} bay - Bay name (e.g., "Bay 1")
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time in HH:mm format
   * @param {number} duration - Duration in hours
   * @param {string|null} excludeBookingId - Optional booking ID to exclude (for editing)
   * @returns {Promise<boolean>} - True if available
   */
  async isBayAvailable(bay, date, startTime, duration, excludeBookingId = null) {
    try {
      const endTime = this.calculateEndTime(startTime, duration);

      // Build query to find overlapping bookings
      let query = this.supabase
        .from('bookings')
        .select('id')
        .eq('bay', bay)
        .eq('date', date)
        .eq('status', 'confirmed');

      // Exclude specific booking if provided (for editing)
      if (excludeBookingId) {
        query = query.neq('id', excludeBookingId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Check for time overlaps
      for (const booking of data || []) {
        // Get booking details to check time overlap
        const { data: bookingData, error: bookingError } = await this.supabase
          .from('bookings')
          .select('start_time, duration')
          .eq('id', booking.id)
          .single();

        if (bookingError) continue;

        const bookingEndTime = this.calculateEndTime(bookingData.start_time, bookingData.duration);

        // Check if time slots overlap
        const hasOverlap = (
          (startTime >= bookingData.start_time && startTime < bookingEndTime) ||
          (endTime > bookingData.start_time && endTime <= bookingEndTime) ||
          (startTime <= bookingData.start_time && endTime >= bookingEndTime)
        );

        if (hasOverlap) {
          log('DEBUG', 'Bay not available - time overlap', {
            bay,
            date,
            requestedStart: startTime,
            requestedEnd: endTime,
            existingBooking: booking.id,
            existingStart: bookingData.start_time,
            existingEnd: bookingEndTime
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      log('ERROR', 'Failed to check bay availability', {
        bay,
        date,
        startTime,
        duration,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Auto-assign an available bay based on party size
   * @param {number} numberOfPeople - Party size
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time in HH:mm format
   * @param {number} duration - Duration in hours
   * @returns {Promise<string|null>} - Assigned bay name or null if none available
   */
  async assignBay(numberOfPeople, date, startTime, duration) {
    try {
      // Determine bay preference based on party size
      let bayPreferences;

      if (numberOfPeople === 1) {
        // Single player: prefer AI bay (Bay 4), then social bays
        bayPreferences = [...this.BAYS.AI, ...this.BAYS.SOCIAL];
      } else if (numberOfPeople === 2) {
        // Two players: prefer social bays, but can use AI bay (Bay 4) if social are full
        bayPreferences = [...this.BAYS.SOCIAL, ...this.BAYS.AI];
      } else if (numberOfPeople <= this.MAX_PEOPLE_SOCIAL) {
        // Larger groups (3-5): social bays only
        bayPreferences = this.BAYS.SOCIAL;
      } else {
        // Group too large for any bay
        log('WARN', 'Party size exceeds maximum capacity', {
          numberOfPeople,
          maxCapacity: this.MAX_PEOPLE_SOCIAL
        });
        return null;
      }

      // Check each bay in preference order
      for (const bay of bayPreferences) {
        const isAvailable = await this.isBayAvailable(bay, date, startTime, duration);
        if (isAvailable) {
          log('DEBUG', 'Bay assigned', {
            bay,
            numberOfPeople,
            date,
            startTime,
            duration
          });
          return bay;
        }
      }

      log('WARN', 'No bays available for requested time slot', {
        numberOfPeople,
        date,
        startTime,
        duration
      });
      return null;
    } catch (error) {
      log('ERROR', 'Failed to assign bay', {
        numberOfPeople,
        date,
        startTime,
        duration,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate booking ID in format BK20251201001
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<string>} - Generated booking ID
   */
  async generateBookingId(date) {
    try {
      // Format: BK + YYYYMMDD + sequential number
      const dateStr = date.replace(/-/g, '').substring(2); // Get YYMMDD
      const prefix = `BK${dateStr}`;

      // Get highest booking ID for this date
      const { data, error } = await this.supabase
        .from('bookings')
        .select('id')
        .like('id', `${prefix}%`)
        .order('id', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      // Extract sequence number
      let nextSeq = 1;
      if (data && data.length > 0) {
        const match = data[0].id.match(/BK\d{6}(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }

      // Format: BK20251201001, BK20251201002, etc.
      const bookingId = `${prefix}${String(nextSeq).padStart(3, '0')}`;

      log('DEBUG', 'Generated booking ID', { bookingId, date });
      return bookingId;
    } catch (error) {
      log('ERROR', 'Failed to generate booking ID', {
        date,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check availability and return available bay
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time (any format)
   * @param {number} duration - Duration in hours
   * @param {number} numberOfPeople - Party size
   * @returns {Promise<object>} - { available: boolean, bay: string|null }
   */
  async checkAvailability(date, startTime, duration, numberOfPeople) {
    try {
      const standardTime = this.parseTimeToStandard(startTime);
      const bay = await this.assignBay(numberOfPeople, date, standardTime, duration);

      return {
        available: bay !== null,
        bay
      };
    } catch (error) {
      log('ERROR', 'Failed to check availability', {
        date,
        startTime,
        duration,
        numberOfPeople,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new booking
   * @param {object} bookingData - Booking information
   * @returns {Promise<object>} - Created booking record
   */
  async createBooking(bookingData) {
    try {
      const {
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        date,
        startTime,
        duration,
        numberOfPeople,
        bay,
        customerContactedVia,
        reservationKey = null,
        customerNotes = null,
        userId = null
      } = bookingData;

      // Validate required fields
      if (!customerName || (!customerPhone && !customerEmail) || !date || !startTime || !duration || !numberOfPeople) {
        throw new Error('Missing required booking fields');
      }

      // Generate dummy phone if missing (format: 0000 + MMDD + random 4 digits)
      // This satisfies the NOT NULL constraint while indicating it's not a real number
      let finalPhoneNumber = customerPhone;
      if (!finalPhoneNumber) {
        const today = new Date();
        const mmdd = String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        finalPhoneNumber = `0000${mmdd}${random}`;
        log('INFO', 'Generated dummy phone number for booking', { 
          customerName, 
          generatedPhone: finalPhoneNumber 
        });
      }

      // Parse and validate time
      const standardStartTime = this.parseTimeToStandard(startTime);

      // Auto-assign bay if not provided
      let assignedBay = bay;
      if (!assignedBay) {
        assignedBay = await this.assignBay(numberOfPeople, date, standardStartTime, duration);
        if (!assignedBay) {
          throw new Error('NO_BAY_AVAILABLE');
        }
      } else {
        // Verify specified bay is available
        const isAvailable = await this.isBayAvailable(assignedBay, date, standardStartTime, duration);
        if (!isAvailable) {
          throw new Error(`Bay ${assignedBay} is not available for requested time`);
        }
      }

      // Generate booking ID
      const bookingId = await this.generateBookingId(date);

      // Create booking record
      const newBooking = {
        id: bookingId,
        user_id: userId || '0eb32c8b-b2eb-4c8d-ba19-fc4f8e15f4c7', // Default guest user ID
        customer_id: customerId || null,
        name: customerName,
        phone_number: finalPhoneNumber,
        email: customerEmail || '',
        date,
        start_time: standardStartTime,
        duration,
        number_of_people: numberOfPeople,
        bay: assignedBay,
        status: 'confirmed',
        customer_contacted_via: customerContactedVia || 'Email Automation',
        reservation_key: reservationKey,
        customer_notes: customerNotes,
        updated_by_type: 'system',
        updated_by_identifier: 'Email Automation'
      };

      const { data, error } = await this.supabase
        .from('bookings')
        .insert(newBooking)
        .select()
        .single();

      if (error) {
        log('ERROR', 'Error creating booking', {
          bookingData: newBooking,
          error: error.message
        });
        throw error;
      }

      log('INFO', 'Booking created successfully', {
        bookingId: data.id,
        customerName: data.name,
        date: data.date,
        startTime: data.start_time,
        bay: data.bay
      });

      return data;
    } catch (error) {
      log('ERROR', 'Failed to create booking', {
        bookingData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel a booking
   * @param {string} bookingId - Booking ID
   * @param {string} reason - Cancellation reason
   * @param {string} cancelledBy - Who cancelled (default "Email Automation")
   * @returns {Promise<object>} - Updated booking record
   */
  async cancelBooking(bookingId, reason, cancelledBy = 'Email Automation') {
    try {
      const updates = {
        status: 'cancelled',
        cancelled_by_type: 'system',
        cancelled_by_identifier: cancelledBy,
        cancellation_reason: reason
      };

      const { data, error } = await this.supabase
        .from('bookings')
        .update(updates)
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        log('ERROR', 'Error cancelling booking', {
          bookingId,
          reason,
          error: error.message
        });
        throw error;
      }

      log('INFO', 'Booking cancelled successfully', {
        bookingId,
        reason,
        cancelledBy
      });

      return data;
    } catch (error) {
      log('ERROR', 'Failed to cancel booking', {
        bookingId,
        reason,
        cancelledBy,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find booking by ClassPass reservation key
   * @param {string} reservationKey - ClassPass reservation key
   * @returns {Promise<object|null>} - Booking record or null
   */
  async findBookingByReservationKey(reservationKey) {
    try {
      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('reservation_key', reservationKey)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      log('ERROR', 'Failed to find booking by reservation key', {
        reservationKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find booking by customer details and time
   * @param {string} customerName - Customer name
   * @param {string} phone - Phone number
   * @param {string} email - Email address
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time
   * @param {string} source - Booking source (e.g., "ResOS")
   * @returns {Promise<object|null>} - Booking record or null
   */
  async findBookingByDetails(customerName, phone, email, date, startTime, source = null) {
    try {
      const standardStartTime = this.parseTimeToStandard(startTime);

      let query = this.supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .eq('date', date)
        .eq('start_time', standardStartTime);

      if (source) {
        query = query.eq('customer_contacted_via', source);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      // Filter by customer details (phone, email, or name)
      const matches = data.filter(booking => {
        const phoneMatch = phone && booking.phone_number.includes(phone);
        const emailMatch = email && booking.email && booking.email.toLowerCase() === email.toLowerCase();
        const nameMatch = customerName && booking.name.toLowerCase().includes(customerName.toLowerCase());

        return phoneMatch || emailMatch || nameMatch;
      });

      if (matches.length === 0) {
        return null;
      }

      if (matches.length > 1) {
        log('WARN', 'Multiple bookings found matching criteria - ambiguous', {
          customerName,
          phone,
          email,
          date,
          startTime,
          matchCount: matches.length
        });
        return null; // Ambiguous match
      }

      return matches[0];
    } catch (error) {
      log('ERROR', 'Failed to find booking by details', {
        customerName,
        phone,
        email,
        date,
        startTime,
        source,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { BookingService };

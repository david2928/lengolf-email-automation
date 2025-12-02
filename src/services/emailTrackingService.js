const { log } = require('../utils/logging');

/**
 * EmailTrackingService - Prevents duplicate email processing
 *
 * Tracks processed ClassPass and ResOS emails in the database to ensure
 * each email is only processed once, preventing duplicate bookings and notifications.
 */
class EmailTrackingService {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('Supabase client is required for EmailTrackingService');
    }
    this.supabase = supabase;
  }

  /**
   * Check if an email has already been processed
   * @param {string} gmailMessageId - Unique Gmail message ID
   * @returns {Promise<boolean>} - True if already processed
   */
  async isProcessed(gmailMessageId) {
    try {
      const { data, error } = await this.supabase
        .from('processed_emails')
        .select('id, action_taken, processed_at')
        .eq('gmail_message_id', gmailMessageId)
        .limit(1);

      if (error) {
        log('ERROR', 'Error checking if email is processed', {
          gmailMessageId,
          error: error.message
        });
        throw error;
      }

      const isProcessed = data && data.length > 0;

      if (isProcessed) {
        log('DEBUG', 'Email already processed', {
          gmailMessageId,
          actionTaken: data[0].action_taken,
          processedAt: data[0].processed_at
        });
      }

      return isProcessed;
    } catch (error) {
      log('ERROR', 'Failed to check email processing status', {
        gmailMessageId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Mark an email as processed with the action taken
   * @param {string} gmailMessageId - Unique Gmail message ID
   * @param {string} sourceType - 'classpass' or 'resos'
   * @param {string} actionTaken - 'booking_created', 'booking_cancelled', 'no_slots', or 'error'
   * @param {string|null} bookingId - Optional booking ID if booking was created
   * @param {string|null} errorMessage - Optional error message if action failed
   * @param {object} emailMetadata - Optional metadata (subject, date)
   * @returns {Promise<object>} - Inserted record
   */
  async markProcessed(gmailMessageId, sourceType, actionTaken, bookingId = null, errorMessage = null, emailMetadata = {}) {
    try {
      // Validate inputs
      if (!gmailMessageId || !sourceType || !actionTaken) {
        throw new Error('gmailMessageId, sourceType, and actionTaken are required');
      }

      const validSourceTypes = ['classpass', 'resos'];
      if (!validSourceTypes.includes(sourceType)) {
        throw new Error(`Invalid sourceType: ${sourceType}. Must be one of: ${validSourceTypes.join(', ')}`);
      }

      const validActions = ['booking_created', 'booking_cancelled', 'no_slots', 'error'];
      if (!validActions.includes(actionTaken)) {
        throw new Error(`Invalid actionTaken: ${actionTaken}. Must be one of: ${validActions.join(', ')}`);
      }

      // Parse email date from RFC 2822 format to PostgreSQL-compatible ISO format
      let parsedEmailDate = null;
      if (emailMetadata.date) {
        try {
          parsedEmailDate = new Date(emailMetadata.date).toISOString();
        } catch (dateError) {
          log('WARN', 'Failed to parse email date, storing as null', {
            gmailMessageId,
            rawDate: emailMetadata.date,
            error: dateError.message
          });
        }
      }

      const record = {
        gmail_message_id: gmailMessageId,
        source_type: sourceType,
        action_taken: actionTaken,
        booking_id: bookingId,
        error_message: errorMessage,
        email_subject: emailMetadata.subject || null,
        email_date: parsedEmailDate
      };

      const { data, error } = await this.supabase
        .from('processed_emails')
        .insert(record)
        .select()
        .single();

      if (error) {
        // Check if it's a duplicate (unique constraint violation)
        if (error.code === '23505') {
          log('WARN', 'Email already marked as processed (duplicate)', {
            gmailMessageId,
            sourceType,
            actionTaken
          });

          // Return existing record
          const { data: existingData } = await this.supabase
            .from('processed_emails')
            .select('*')
            .eq('gmail_message_id', gmailMessageId)
            .single();

          return existingData;
        }

        log('ERROR', 'Error marking email as processed', {
          gmailMessageId,
          sourceType,
          actionTaken,
          error: error.message
        });
        throw error;
      }

      log('INFO', 'Email marked as processed', {
        gmailMessageId,
        sourceType,
        actionTaken,
        bookingId,
        hasError: !!errorMessage
      });

      return data;
    } catch (error) {
      log('ERROR', 'Failed to mark email as processed', {
        gmailMessageId,
        sourceType,
        actionTaken,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get processing history for a source type
   * @param {string} sourceType - 'classpass' or 'resos'
   * @param {number} limit - Number of records to return (default 100)
   * @returns {Promise<Array>} - Array of processed email records
   */
  async getHistory(sourceType, limit = 100) {
    try {
      const query = this.supabase
        .from('processed_emails')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(limit);

      if (sourceType) {
        query.eq('source_type', sourceType);
      }

      const { data, error } = await query;

      if (error) {
        log('ERROR', 'Error fetching processing history', {
          sourceType,
          limit,
          error: error.message
        });
        throw error;
      }

      return data || [];
    } catch (error) {
      log('ERROR', 'Failed to fetch processing history', {
        sourceType,
        limit,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get statistics about processed emails
   * @param {string} sourceType - Optional filter by source type
   * @returns {Promise<object>} - Statistics object
   */
  async getStats(sourceType = null) {
    try {
      let query = this.supabase
        .from('processed_emails')
        .select('action_taken, source_type');

      if (sourceType) {
        query = query.eq('source_type', sourceType);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Calculate statistics
      const stats = {
        total: data.length,
        byAction: {},
        bySource: {}
      };

      data.forEach(record => {
        // Count by action
        stats.byAction[record.action_taken] = (stats.byAction[record.action_taken] || 0) + 1;

        // Count by source
        stats.bySource[record.source_type] = (stats.bySource[record.source_type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      log('ERROR', 'Failed to get processing statistics', {
        sourceType,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { EmailTrackingService };

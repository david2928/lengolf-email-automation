const { log } = require('../utils/logging');

/**
 * CustomerService - Handles customer matching and creation
 *
 * Provides methods to match existing customers by phone, email, or name,
 * and create new customers with auto-generated customer codes.
 */
class CustomerService {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('Supabase client is required for CustomerService');
    }
    this.supabase = supabase;
  }

  /**
   * Normalize phone number to last 9 digits for matching
   * @param {string} phoneInput - Phone number in any format
   * @returns {string} - Normalized phone (last 9 digits)
   */
  normalizePhone(phoneInput) {
    if (!phoneInput) return '';

    // Remove all non-digit characters
    let digits = phoneInput.replace(/[^0-9]/g, '');

    // Remove +66 country code (Thailand)
    if (digits.startsWith('66')) {
      digits = digits.substring(2);
    }

    // Remove leading 0
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }

    // Return last 9 digits for matching
    return digits.substring(Math.max(0, digits.length - 9));
  }

  /**
   * Find customer by normalized phone number
   * @param {string} phoneNumber - Phone number to search
   * @returns {Promise<object|null>} - Customer record or null
   */
  async findByPhone(phoneNumber) {
    try {
      const normalizedPhone = this.normalizePhone(phoneNumber);

      if (!normalizedPhone || normalizedPhone.length < 9) {
        log('WARN', 'Phone number too short for matching', { phoneNumber, normalizedPhone });
        return null;
      }

      const { data, error } = await this.supabase
        .from('customers')
        .select('*')
        .eq('normalized_phone', normalizedPhone)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        log('ERROR', 'Error finding customer by phone', {
          phoneNumber,
          normalizedPhone,
          error: error.message
        });
        throw error;
      }

      if (data && data.length > 0) {
        log('DEBUG', 'Customer found by phone', {
          phoneNumber,
          normalizedPhone,
          customerId: data[0].id,
          customerName: data[0].customer_name
        });
        return data[0];
      }

      return null;
    } catch (error) {
      log('ERROR', 'Failed to find customer by phone', {
        phoneNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find customer by email (case-insensitive)
   * @param {string} email - Email address to search
   * @returns {Promise<object|null>} - Customer record or null
   */
  async findByEmail(email) {
    try {
      if (!email) return null;

      const { data, error } = await this.supabase
        .from('customers')
        .select('*')
        .ilike('email', email)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        log('ERROR', 'Error finding customer by email', {
          email,
          error: error.message
        });
        throw error;
      }

      if (data && data.length > 0) {
        log('DEBUG', 'Customer found by email', {
          email,
          customerId: data[0].id,
          customerName: data[0].customer_name
        });
        return data[0];
      }

      return null;
    } catch (error) {
      log('ERROR', 'Failed to find customer by email', {
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find customer by fuzzy name matching (>= threshold similarity)
   * @param {string} name - Name to search
   * @param {number} threshold - Similarity threshold (0.0 to 1.0, default 0.9)
   * @returns {Promise<object|null>} - Customer record or null
   */
  async findByFuzzyName(name, threshold = 0.9) {
    try {
      if (!name) return null;

      // Use the existing RPC function for fuzzy name matching
      const { data, error } = await this.supabase
        .rpc('find_customers_by_fuzzy_name', {
          search_name: name,
          min_similarity: threshold
        });

      if (error) {
        log('ERROR', 'Error finding customer by fuzzy name', {
          name,
          threshold,
          error: error.message
        });
        throw error;
      }

      // Only return if exactly one match with high similarity
      if (data && data.length === 1 && data[0].similarity >= threshold) {
        log('DEBUG', 'Customer found by fuzzy name', {
          searchName: name,
          foundName: data[0].customer_name,
          similarity: data[0].similarity,
          customerId: data[0].id
        });
        return data[0];
      }

      // If multiple matches or low similarity, return null (ambiguous)
      if (data && data.length > 1) {
        log('WARN', 'Multiple customers found with similar names - ambiguous match', {
          searchName: name,
          matchCount: data.length,
          topMatches: data.slice(0, 3).map(c => ({ name: c.customer_name, similarity: c.similarity }))
        });
      }

      return null;
    } catch (error) {
      log('ERROR', 'Failed to find customer by fuzzy name', {
        name,
        threshold,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Match customer by phone, email, or name (in priority order)
   * @param {string} name - Customer name
   * @param {string} phone - Phone number
   * @param {string} email - Email address
   * @param {boolean} allowFuzzyName - Allow fuzzy name matching (default false)
   * @returns {Promise<object|null>} - { customer, confidence: 'high'|'medium' } or null
   */
  async matchCustomer(name, phone, email, allowFuzzyName = false) {
    try {
      // Priority 1: Match by phone (most reliable)
      if (phone) {
        const customer = await this.findByPhone(phone);
        if (customer) {
          return { customer, confidence: 'high', matchedBy: 'phone' };
        }
      }

      // Priority 2: Match by email
      if (email) {
        const customer = await this.findByEmail(email);
        if (customer) {
          return { customer, confidence: 'high', matchedBy: 'email' };
        }
      }

      // Priority 3: Fuzzy name matching (only if allowed, e.g., for ClassPass)
      if (allowFuzzyName && name) {
        const threshold = parseFloat(process.env.FUZZY_NAME_THRESHOLD || '0.9');
        const customer = await this.findByFuzzyName(name, threshold);
        if (customer) {
          return { customer, confidence: 'medium', matchedBy: 'fuzzy_name' };
        }
      }

      log('DEBUG', 'No matching customer found', { name, phone, email, allowFuzzyName });
      return null;
    } catch (error) {
      log('ERROR', 'Failed to match customer', {
        name,
        phone,
        email,
        allowFuzzyName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate next customer code (CUS-001, CUS-002, etc.)
   * Uses PostgreSQL sequence for atomic, race-condition-free generation
   * @returns {Promise<string>} - Next customer code
   */
  async generateCustomerCode() {
    try {
      // Use database sequence for atomic customer code generation
      const { data, error } = await this.supabase
        .rpc('generate_next_customer_code');

      if (error) {
        throw error;
      }

      const customerCode = data;

      log('DEBUG', 'Generated customer code from sequence', { customerCode });
      return customerCode;
    } catch (error) {
      log('ERROR', 'Failed to generate customer code', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new customer
   * @param {object} customerData - Customer information
   * @param {string} customerData.name - Customer name
   * @param {string} customerData.phone - Phone number
   * @param {string} customerData.email - Email address
   * @returns {Promise<object>} - Created customer record
   */
  async createCustomer(customerData) {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const { name, phone, email } = customerData;

        if (!name) {
          throw new Error('Customer name is required');
        }

        if (!phone && !email) {
          throw new Error('At least one contact method (phone or email) is required');
        }

        // Generate customer code
        const customerCode = await this.generateCustomerCode();

        // Normalize phone
        const normalizedPhone = phone ? this.normalizePhone(phone) : null;

        const newCustomer = {
          customer_code: customerCode,
          customer_name: name,
          contact_number: phone || null,
          email: email || null,
          normalized_phone: normalizedPhone,
          is_active: true,
          preferred_contact_method: phone ? 'Phone' : 'Email'
        };

        const { data, error } = await this.supabase
          .from('customers')
          .insert(newCustomer)
          .select()
          .single();

        if (error) {
          // Check for duplicate phone number
          if (error.code === '23505' && error.message.includes('normalized_phone')) {
            log('WARN', 'Customer with this phone number already exists', {
              phone,
              normalizedPhone
            });
            throw new Error('DUPLICATE_PHONE');
          }

          // Check for duplicate customer_code (race condition)
          if (error.code === '23505' && error.message.includes('customer_code')) {
            attempt++;
            if (attempt < MAX_RETRIES) {
              log('WARN', 'Customer code collision detected, retrying', {
                attempt,
                customerCode
              });
              // Add small random delay to reduce collision probability
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
              continue; // Retry with new code
            } else {
              log('ERROR', 'Failed to create customer after max retries', {
                customerData,
                maxRetries: MAX_RETRIES
              });
              throw new Error('Failed to generate unique customer code after multiple attempts');
            }
          }

          log('ERROR', 'Error creating customer', {
            customerData,
            error: error.message
          });
          throw error;
        }

        log('INFO', 'Customer created successfully', {
          customerId: data.id,
          customerCode: data.customer_code,
          customerName: data.customer_name,
          attemptsNeeded: attempt + 1
        });

        return data;
      } catch (error) {
        // Only retry on customer_code collision, re-throw other errors
        if (error.message === 'DUPLICATE_PHONE' ||
            (error.code !== '23505' && !error.message.includes('customer_code'))) {
          log('ERROR', 'Failed to create customer', {
            customerData,
            error: error.message
          });
          throw error;
        }
        // If we get here on last attempt, throw
        if (attempt >= MAX_RETRIES - 1) {
          log('ERROR', 'Failed to create customer after retries', {
            customerData,
            error: error.message
          });
          throw error;
        }
      }
    }
  }

  /**
   * Get or create customer (convenience method)
   * @param {object} customerData - Customer information
   * @param {boolean} allowFuzzyName - Allow fuzzy name matching
   * @returns {Promise<object>} - { customer, isNew, matchedBy }
   */
  async getOrCreateCustomer(customerData, allowFuzzyName = false) {
    try {
      const { name, phone, email } = customerData;

      // Try to match existing customer
      const match = await this.matchCustomer(name, phone, email, allowFuzzyName);

      if (match) {
        return {
          customer: match.customer,
          isNew: false,
          matchedBy: match.matchedBy,
          confidence: match.confidence
        };
      }

      // Create new customer
      const customer = await this.createCustomer(customerData);

      return {
        customer,
        isNew: true,
        matchedBy: null,
        confidence: null
      };
    } catch (error) {
      log('ERROR', 'Failed to get or create customer', {
        customerData,
        allowFuzzyName,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { CustomerService };

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { FacebookB2BProcessor } = require('../processors/facebookB2BProcessor');
const { FacebookB2CProcessor } = require('../processors/facebookB2CProcessor');
const { log } = require('../utils/logging');

// Constants
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;
const FORM_ID_B2B_NEW = process.env.FORM_ID_B2B_NEW;
const FORM_ID_B2C_NEW = process.env.FORM_ID_B2C_NEW;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Date cutoff (March 6th, 2025)
const CUTOFF_DATE = new Date('2025-03-06T00:00:00Z');

// Initialize processors
const b2bProcessor = new FacebookB2BProcessor();
const b2cProcessor = new FacebookB2CProcessor();

/**
 * Fetch leads from a specific form since the cutoff date
 * @param {string} formId - The Facebook form ID
 * @returns {Promise<Array>} - Array of leads
 */
async function fetchLeadsSinceCutoff(formId) {
  try {
    const url = `https://graph.facebook.com/v18.0/${formId}/leads`;
    const params = {
      access_token: META_ACCESS_TOKEN,
      fields: 'created_time,field_data,ad_id,ad_name,form_id,platform,is_organic',
      limit: 100 // Increase limit to get more leads at once
    };

    log('INFO', `Fetching leads from form ${formId} since ${CUTOFF_DATE.toISOString()}`, { formId });
    const response = await axios.get(url, { params });
    
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      log('INFO', 'No leads found for form', { formId });
      return [];
    }

    // Filter leads by date
    const recentLeads = response.data.data.filter(lead => {
      const leadDate = new Date(lead.created_time);
      return leadDate >= CUTOFF_DATE;
    });

    log('INFO', `Found ${recentLeads.length} leads since cutoff date`, { 
      formId,
      totalLeads: response.data.data.length,
      filteredLeads: recentLeads.length
    });
    
    return recentLeads;
  } catch (error) {
    log('ERROR', 'Error fetching leads from Facebook', { 
      error: error.message, 
      formId 
    });
    throw error;
  }
}

/**
 * Check if a lead has already been processed
 * @param {string} leadId - The Facebook lead ID
 * @returns {Promise<boolean>} - True if already processed
 */
async function isLeadProcessed(leadId) {
  try {
    const { data, error } = await supabase
      .from('processed_leads')
      .select('id')
      .eq('lead_id', leadId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      log('ERROR', 'Error checking if lead is processed', { 
        error: error.message,
        leadId
      });
      throw error;
    }
    
    return !!data;
  } catch (error) {
    log('ERROR', 'Error checking processed leads in Supabase', {
      error: error.message,
      leadId
    });
    throw error;
  }
}

/**
 * Mark a lead as processed in the database
 * @param {Object} lead - The lead object
 * @param {string} type - The lead type (B2B or B2C)
 * @returns {Promise<void>}
 */
async function markLeadAsProcessed(lead, type) {
  try {
    const { error } = await supabase
      .from('processed_leads')
      .insert({
        lead_id: lead.id,
        form_id: lead.form_id,
        lead_type: type,
        created_at: new Date().toISOString(),
        lead_created_at: lead.created_time
      });
    
    if (error) {
      log('ERROR', 'Error marking lead as processed', { 
        error: error.message,
        leadId: lead.id
      });
      throw error;
    }
    
    log('INFO', 'Lead marked as processed', { leadId: lead.id, type });
  } catch (error) {
    log('ERROR', 'Error inserting into Supabase', {
      error: error.message,
      leadId: lead.id
    });
    throw error;
  }
}

/**
 * Map Facebook lead fields to our data structure
 * @param {Object} lead - The Facebook lead object
 * @param {string} type - The lead type (B2B or B2C)
 * @returns {Object} - Mapped lead data
 */
function mapLeadFields(lead, type) {
  const fieldMap = {};
  
  // Extract field data into a map
  lead.field_data.forEach(field => {
    fieldMap[field.name] = field.values[0];
  });

  // Common fields
  const mappedLead = {
    id: lead.id,
    formId: lead.form_id,
    createdTime: lead.created_time,
    fullName: fieldMap['full_name'],
    email: fieldMap['email'],
    phoneNumber: fieldMap['phone_number']
  };

  // B2B specific fields
  if (type === 'B2B') {
    return {
      ...mappedLead,
      companyName: fieldMap['company_name'],
      eventType: fieldMap['event_type'],
      eventGroupType: fieldMap['event_group_type'],
      expectedAttendees: fieldMap['expected_attendees'],
      budgetPerPerson: fieldMap['budget_per_person'],
      preferredDate: fieldMap['preferred_date'],
      eventPlanningTimeline: fieldMap['event_planning_timeline'],
      interestedActivities: fieldMap['interested_activities'],
      additionalActivities: fieldMap['additional_activities'],
      // New form fields
      eventObjective: fieldMap['event_objective'],
      eventLocation: fieldMap['event_location'],
      eventFormat: fieldMap['event_format'],
      eventDuration: fieldMap['event_duration'],
      specialRequirements: fieldMap['special_requirements']
    };
  }
  
  // B2C specific fields
  return {
    ...mappedLead,
    previousLengolfExperience: fieldMap['previous_lengolf_experience'],
    groupSize: fieldMap['group_size'],
    preferredTime: fieldMap['preferred_time'],
    plannedVisit: fieldMap['planned_visit'],
    additionalInquiries: fieldMap['additional_inquiries'],
    // New form fields
    visitPurpose: fieldMap['visit_purpose'],
    preferredLocation: fieldMap['preferred_location'],
    golfExperience: fieldMap['golf_experience'],
    foodPreferences: fieldMap['food_preferences'],
    specialOccasion: fieldMap['special_occasion']
  };
}

/**
 * Process leads from a specific form
 * @param {string} formId - The Facebook form ID
 * @param {string} type - The lead type (B2B or B2C)
 * @returns {Promise<number>} - Number of leads processed
 */
async function processLeadsFromForm(formId, type) {
  try {
    const leads = await fetchLeadsSinceCutoff(formId);
    let processedCount = 0;
    
    for (const lead of leads) {
      try {
        // Check if lead has already been processed
        const alreadyProcessed = await isLeadProcessed(lead.id);
        if (alreadyProcessed) {
          log('INFO', 'Lead already processed, skipping', { 
            leadId: lead.id,
            createdTime: lead.created_time
          });
          continue;
        }
        
        // Map lead fields
        const mappedLead = mapLeadFields(lead, type);
        
        // Process lead based on type
        if (type === 'B2B') {
          await b2bProcessor.process(mappedLead);
        } else {
          await b2cProcessor.process(mappedLead);
        }
        
        // Mark lead as processed
        await markLeadAsProcessed(lead, type);
        processedCount++;
        
        log('SUCCESS', `Processed ${type} lead`, { 
          leadId: lead.id,
          name: mappedLead.fullName,
          email: mappedLead.email
        });
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log('ERROR', `Error processing ${type} lead`, {
          error: error.message,
          leadId: lead.id
        });
        // Continue with next lead even if one fails
      }
    }
    
    return processedCount;
  } catch (error) {
    log('ERROR', `Error processing ${type} leads`, {
      error: error.message,
      formId
    });
    return 0;
  }
}

/**
 * Main function to process all recent leads
 */
async function processRecentLeads() {
  try {
    log('INFO', 'Starting to process recent leads', {
      cutoffDate: CUTOFF_DATE.toISOString()
    });
    
    // Process B2B leads
    const b2bProcessed = await processLeadsFromForm(FORM_ID_B2B_NEW, 'B2B');
    
    // Process B2C leads
    const b2cProcessed = await processLeadsFromForm(FORM_ID_B2C_NEW, 'B2C');
    
    log('SUCCESS', 'Completed processing recent leads', {
      b2bProcessed,
      b2cProcessed,
      total: b2bProcessed + b2cProcessed
    });
  } catch (error) {
    log('ERROR', 'Error in processRecentLeads', {
      error: error.message
    });
  }
}

// Run the script
processRecentLeads(); 
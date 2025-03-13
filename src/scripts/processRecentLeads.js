require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { FacebookB2BProcessor } = require('../processors/facebookB2BProcessor');
const { FacebookB2CProcessor } = require('../processors/facebookB2CProcessor');
const { log } = require('../utils/logging');

// Debug logging
console.log('Script starting...');
log('INFO', 'Script starting', { timestamp: new Date().toISOString() });

// Constants
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;

// All form IDs from the code snippet
const FORM_ID_B2B_NEW = '562422893450533';
const FORM_ID_B2B_OLD = '905376497889703';
const FORM_ID_B2C_NEW = '625669719834512';
const FORM_ID_B2C_OLD = '1067700894958557';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug logging for environment variables
console.log('Environment variables loaded:');
console.log(`META_PAGE_ID: ${META_PAGE_ID}`);
console.log(`FORM_ID_B2B_NEW: ${FORM_ID_B2B_NEW}`);
console.log(`FORM_ID_B2B_OLD: ${FORM_ID_B2B_OLD}`);
console.log(`FORM_ID_B2C_NEW: ${FORM_ID_B2C_NEW}`);
console.log(`FORM_ID_B2C_OLD: ${FORM_ID_B2C_OLD}`);
console.log(`SUPABASE_URL: ${SUPABASE_URL ? 'Set' : 'Not set'}`);
console.log(`SUPABASE_KEY: ${SUPABASE_KEY ? 'Set' : 'Not set'}`);

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Date cutoff (March 6th, 2025)
const CUTOFF_DATE = new Date('2025-03-06T00:00:00Z');

// Log configuration values (without sensitive data)
log('INFO', 'Script configuration', {
  pageId: META_PAGE_ID,
  formIdB2BNew: FORM_ID_B2B_NEW,
  formIdB2BOld: FORM_ID_B2B_OLD,
  formIdB2CNew: FORM_ID_B2C_NEW,
  formIdB2COld: FORM_ID_B2C_OLD,
  cutoffDate: CUTOFF_DATE.toISOString()
});

// Initialize processors
const b2bProcessor = new FacebookB2BProcessor();
const b2cProcessor = new FacebookB2CProcessor();
console.log('Processors initialized successfully');

/**
 * Fetch leads from a specific form since the cutoff date
 * @param {string} formId - The Facebook form ID
 * @returns {Promise<Array>} - Array of leads
 */
async function fetchLeadsSinceCutoff(formId) {
  try {
    // First, get the form details from the page
    const formUrl = `https://graph.facebook.com/v18.0/${META_PAGE_ID}/leadgen_forms`;
    const formParams = {
      access_token: META_ACCESS_TOKEN,
      fields: 'id,name,leads{created_time,field_data,ad_id,ad_name,form_id,platform,is_organic}'
    };

    log('INFO', `Fetching forms from page ${META_PAGE_ID}`, { formId });
    console.log(`Fetching forms from page ${META_PAGE_ID} for form ID ${formId}`);
    
    const formResponse = await axios.get(formUrl, { params: formParams });
    
    if (!formResponse.data || !formResponse.data.data || formResponse.data.data.length === 0) {
      log('INFO', 'No forms found for page', { pageId: META_PAGE_ID });
      console.log('No forms found for page');
      return [];
    }

    console.log(`Found ${formResponse.data.data.length} forms`);

    // Find the form with the matching ID
    const targetForm = formResponse.data.data.find(form => form.id === formId);
    
    if (!targetForm) {
      log('WARN', 'Form not found', { formId });
      console.log(`Form with ID ${formId} not found`);
      return [];
    }

    console.log(`Found form: ${targetForm.name} (ID: ${targetForm.id})`);

    if (!targetForm.leads || !targetForm.leads.data || targetForm.leads.data.length === 0) {
      log('INFO', 'No leads found for form', { formId, formName: targetForm.name });
      console.log(`No leads found for form ${targetForm.name}`);
      return [];
    }

    console.log(`Found ${targetForm.leads.data.length} leads for form ${targetForm.name}`);

    // Filter leads by date
    const recentLeads = targetForm.leads.data.filter(lead => {
      const leadDate = new Date(lead.created_time);
      return leadDate >= CUTOFF_DATE;
    });

    log('INFO', `Found ${recentLeads.length} leads since cutoff date`, { 
      formId,
      formName: targetForm.name,
      totalLeads: targetForm.leads.data.length,
      filteredLeads: recentLeads.length
    });
    
    console.log(`Found ${recentLeads.length} leads since cutoff date ${CUTOFF_DATE.toISOString()}`);
    
    return recentLeads;
  } catch (error) {
    log('ERROR', 'Error fetching leads from Facebook', { 
      error: error.message, 
      formId 
    });
    console.error('Error fetching leads from Facebook:', error.message);
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
    console.log(`Checking if lead ${leadId} has been processed`);
    
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
      console.error('Error checking if lead is processed:', error.message);
      throw error;
    }
    
    const isProcessed = !!data;
    console.log(`Lead ${leadId} processed status: ${isProcessed}`);
    return isProcessed;
  } catch (error) {
    log('ERROR', 'Error checking processed leads in Supabase', {
      error: error.message,
      leadId
    });
    console.error('Error checking processed leads in Supabase:', error.message);
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
  console.log(`Mapping fields for lead ${lead.id} (${type})`);
  
  const fieldMap = {};
  
  // Extract field data into a map
  lead.field_data.forEach(field => {
    fieldMap[field.name] = field.values[0];
  });

  console.log('Field map created:', Object.keys(fieldMap).join(', '));

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
 * Mark a lead as processed in the database
 * @param {Object} lead - The lead object
 * @param {string} type - The lead type (B2B or B2C)
 * @param {Object} mappedLead - The mapped lead data
 * @param {Object} spamInfo - Spam detection information
 * @returns {Promise<void>}
 */
async function markLeadAsProcessed(lead, type, mappedLead, spamInfo = { score: 0, reasons: [], isLikelySpam: false }) {
  try {
    console.log(`Marking lead ${lead.id} as processed`);
    
    // Create the record to insert based on the exact schema
    const record = {
      lead_id: lead.id,
      lead_type: type,
      form_id: lead.form_id,
      form_type: type === 'B2B' ? 'B2B' : 'B2C',
      created_time: lead.created_time,
      processed_at: new Date().toISOString(),
      platform: lead.platform || 'facebook',
      ad_id: lead.ad_id || null,
      ad_set_id: null,
      campaign_id: null,
      full_name: mappedLead.fullName,
      email: mappedLead.email,
      phone_number: mappedLead.phoneNumber,
      // B2B specific fields
      company_name: type === 'B2B' ? mappedLead.companyName : null,
      event_type: type === 'B2B' ? mappedLead.eventType : null,
      preferred_event_date: type === 'B2B' ? mappedLead.preferredDate : null,
      event_planning_timeline: type === 'B2B' ? mappedLead.eventPlanningTimeline : null,
      expected_attendees: type === 'B2B' ? mappedLead.expectedAttendees : null,
      event_group_type: type === 'B2B' ? mappedLead.eventGroupType : null,
      budget_per_person: type === 'B2B' ? mappedLead.budgetPerPerson : null,
      additional_activities: type === 'B2B' ? mappedLead.additionalActivities : null,
      interested_activities: type === 'B2B' ? mappedLead.interestedActivities : null,
      // B2C specific fields
      previous_lengolf_experience: type === 'B2C' ? mappedLead.previousLengolfExperience : null,
      group_size: type === 'B2C' ? mappedLead.groupSize : null,
      preferred_time: type === 'B2C' ? mappedLead.preferredTime : null,
      planned_visit: type === 'B2C' ? mappedLead.plannedVisit : null,
      additional_inquiries: type === 'B2C' ? mappedLead.additionalInquiries : null,
      // Store all fields as JSON
      raw_fields: lead.field_data ? lead.field_data : null,
      // Spam detection
      spam_score: spamInfo.score || 0,
      spam_reasons: spamInfo.reasons || [],
      is_likely_spam: spamInfo.isLikelySpam || false
    };

    log('INFO', 'Marking lead as processed', { 
      leadId: lead.id, 
      type,
      name: mappedLead.fullName,
      email: mappedLead.email
    });

    console.log(`Inserting record for lead ${lead.id} into Supabase`);
    const { error } = await supabase
      .from('processed_leads')
      .insert(record);
    
    if (error) {
      log('ERROR', 'Error marking lead as processed', { 
        error: error.message,
        leadId: lead.id
      });
      console.error('Error marking lead as processed:', error.message);
      throw error;
    }
    
    log('INFO', 'Lead marked as processed', { leadId: lead.id, type });
    console.log(`Lead ${lead.id} marked as processed successfully`);
  } catch (error) {
    log('ERROR', 'Error inserting into Supabase', {
      error: error.message,
      leadId: lead.id
    });
    console.error('Error inserting into Supabase:', error.message);
    throw error;
  }
}

/**
 * Process leads from a specific form
 * @param {string} formId - The Facebook form ID
 * @param {string} type - The lead type (B2B or B2C)
 * @returns {Promise<number>} - Number of leads processed
 */
async function processLeadsFromForm(formId, type) {
  try {
    console.log(`Processing ${type} leads from form ${formId}`);
    const leads = await fetchLeadsSinceCutoff(formId);
    let processedCount = 0;
    
    console.log(`Found ${leads.length} leads to process`);
    
    for (const lead of leads) {
      try {
        console.log(`Processing lead ${lead.id}`);
        
        // Check if lead has already been processed
        const alreadyProcessed = await isLeadProcessed(lead.id);
        if (alreadyProcessed) {
          log('INFO', 'Lead already processed, skipping', { 
            leadId: lead.id,
            createdTime: lead.created_time
          });
          console.log(`Lead ${lead.id} already processed, skipping`);
          continue;
        }
        
        // Map lead fields
        const mappedLead = mapLeadFields(lead, type);
        
        // Process lead based on type
        let spamInfo = { score: 0, reasons: [], isLikelySpam: false };
        if (type === 'B2B') {
          console.log(`Processing B2B lead ${lead.id}`);
          spamInfo = await b2bProcessor.process(mappedLead);
        } else {
          console.log(`Processing B2C lead ${lead.id}`);
          spamInfo = await b2cProcessor.process(mappedLead);
        }
        
        // Mark lead as processed
        await markLeadAsProcessed(lead, type, mappedLead, spamInfo);
        processedCount++;
        
        log('SUCCESS', `Processed ${type} lead`, { 
          leadId: lead.id,
          name: mappedLead.fullName,
          email: mappedLead.email,
          isSpam: spamInfo.isLikelySpam
        });
        
        console.log(`Successfully processed ${type} lead ${lead.id}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log('ERROR', `Error processing ${type} lead`, {
          error: error.message,
          leadId: lead.id
        });
        console.error(`Error processing ${type} lead ${lead.id}:`, error.message);
        // Continue with next lead even if one fails
      }
    }
    
    return processedCount;
  } catch (error) {
    log('ERROR', `Error processing ${type} leads`, {
      error: error.message,
      formId
    });
    console.error(`Error processing ${type} leads:`, error.message);
    return 0;
  }
}

/**
 * Main function to process all recent leads
 */
async function processRecentLeads() {
  try {
    console.log('Starting to process recent leads');
    log('INFO', 'Starting to process recent leads', {
      cutoffDate: CUTOFF_DATE.toISOString()
    });
    
    // Process B2B leads from new form
    console.log('Processing B2B leads from new form...');
    const b2bNewProcessed = await processLeadsFromForm(FORM_ID_B2B_NEW, 'B2B');
    
    // Process B2B leads from old form
    console.log('Processing B2B leads from old form...');
    const b2bOldProcessed = await processLeadsFromForm(FORM_ID_B2B_OLD, 'B2B');
    
    // Process B2C leads from new form
    console.log('Processing B2C leads from new form...');
    const b2cNewProcessed = await processLeadsFromForm(FORM_ID_B2C_NEW, 'B2C');
    
    // Process B2C leads from old form
    console.log('Processing B2C leads from old form...');
    const b2cOldProcessed = await processLeadsFromForm(FORM_ID_B2C_OLD, 'B2C');
    
    // Calculate total
    const totalProcessed = b2bNewProcessed + b2bOldProcessed + b2cNewProcessed + b2cOldProcessed;
    
    log('SUCCESS', 'Completed processing recent leads', {
      b2bNewProcessed,
      b2bOldProcessed,
      b2cNewProcessed,
      b2cOldProcessed,
      total: totalProcessed
    });
    
    console.log(`Completed processing recent leads: 
      - B2B New: ${b2bNewProcessed}
      - B2B Old: ${b2bOldProcessed}
      - B2C New: ${b2cNewProcessed}
      - B2C Old: ${b2cOldProcessed}
      - Total: ${totalProcessed}`);
  } catch (error) {
    log('ERROR', 'Error in processRecentLeads', {
      error: error.message
    });
    console.error('Error in processRecentLeads:', error.message);
  }
}

// Run the script
console.log('Running processRecentLeads()...');
processRecentLeads(); 
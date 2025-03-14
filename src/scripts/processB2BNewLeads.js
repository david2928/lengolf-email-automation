require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { FacebookB2BProcessor } = require('../processors/facebookB2BProcessor');
const { log } = require('../utils/logging');

// Debug logging
console.log('Script starting...');
log('INFO', 'Script starting', { timestamp: new Date().toISOString() });

// Constants
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;

// Only process B2B New form
const FORM_ID_B2B_NEW = '562422893450533';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug logging for environment variables
console.log('Environment variables loaded:');
console.log(`META_PAGE_ID: ${META_PAGE_ID}`);
console.log(`FORM_ID_B2B_NEW: ${FORM_ID_B2B_NEW}`);
console.log(`SUPABASE_URL: ${SUPABASE_URL ? 'Set' : 'Not set'}`);
console.log(`SUPABASE_KEY: ${SUPABASE_KEY ? 'Set' : 'Not set'}`);

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Date cutoff (March 6th, 2025) - including this date
// Set to the beginning of March 6th in UTC
const CUTOFF_DATE = new Date('2025-03-06T00:00:00Z');

// Log configuration values (without sensitive data)
log('INFO', 'Script configuration', {
  pageId: META_PAGE_ID,
  formIdB2BNew: FORM_ID_B2B_NEW,
  cutoffDate: CUTOFF_DATE.toISOString()
});

// Initialize processor
const b2bProcessor = new FacebookB2BProcessor();
console.log('B2B Processor initialized successfully');

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
      // Check if the lead date is on or after the cutoff date
      // For debugging, log the lead date
      console.log(`Lead ${lead.id} created at: ${leadDate.toISOString()}`);
      
      // Compare dates by converting to date strings (YYYY-MM-DD) to ignore time
      const leadDateString = leadDate.toISOString().split('T')[0];
      const cutoffDateString = CUTOFF_DATE.toISOString().split('T')[0];
      
      return leadDateString >= cutoffDateString;
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
 * @returns {Object} - Mapped lead data
 */
function mapLeadFields(lead) {
  console.log(`Mapping fields for lead ${lead.id} (B2B)`);
  
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
    phoneNumber: fieldMap['phone_number'],
    // B2B specific fields
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

  return mappedLead;
}

/**
 * Mark a lead as processed in the database
 * @param {Object} lead - The lead object
 * @param {Object} mappedLead - The mapped lead data
 * @param {Object} spamInfo - Spam detection information
 * @returns {Promise<void>}
 */
async function markLeadAsProcessed(lead, mappedLead, spamInfo = { score: 0, reasons: [], isLikelySpam: false }) {
  try {
    console.log(`Marking lead ${lead.id} as processed`);
    
    // Create the record to insert based on the exact schema
    const record = {
      lead_id: lead.id,
      lead_type: 'B2B',
      form_id: lead.form_id,
      form_type: 'B2B',
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
      company_name: mappedLead.companyName,
      event_type: mappedLead.eventType,
      preferred_event_date: mappedLead.preferredDate,
      event_planning_timeline: mappedLead.eventPlanningTimeline,
      expected_attendees: mappedLead.expectedAttendees,
      event_group_type: mappedLead.eventGroupType,
      budget_per_person: mappedLead.budgetPerPerson,
      additional_activities: mappedLead.additionalActivities,
      interested_activities: mappedLead.interestedActivities,
      // Store all fields as JSON
      raw_fields: lead.field_data ? lead.field_data : null,
      // Spam detection
      spam_score: spamInfo.score || 0,
      spam_reasons: spamInfo.reasons || [],
      is_likely_spam: spamInfo.isLikelySpam || false
    };

    log('INFO', 'Marking lead as processed', { 
      leadId: lead.id, 
      type: 'B2B',
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
    
    log('INFO', 'Lead marked as processed', { leadId: lead.id, type: 'B2B' });
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
 * Process leads from the B2B New form
 * @returns {Promise<number>} - Number of leads processed
 */
async function processB2BNewLeads() {
  try {
    console.log(`Processing B2B leads from form ${FORM_ID_B2B_NEW}`);
    const leads = await fetchLeadsSinceCutoff(FORM_ID_B2B_NEW);
    let processedCount = 0;
    
    console.log(`Found ${leads.length} leads to process`);
    
    for (const lead of leads) {
      try {
        console.log(`Processing lead ${lead.id}`);
        
        // Check if lead has already been processed
        const alreadyProcessed = await isLeadProcessed(lead.id);
        if (alreadyProcessed) {
          log('INFO', 'Lead already processed, but reprocessing anyway for testing', { 
            leadId: lead.id,
            createdTime: lead.created_time
          });
          console.log(`Lead ${lead.id} already processed, but reprocessing anyway for testing`);
          // Continue with processing instead of skipping
        }
        
        // Map lead fields
        const mappedLead = mapLeadFields(lead);
        
        // Process lead
        console.log(`Processing B2B lead ${lead.id}`);
        const spamInfo = await b2bProcessor.process(mappedLead);
        
        // For testing, we'll log the result but not mark as processed again
        if (alreadyProcessed) {
          log('SUCCESS', `Reprocessed B2B lead (test only)`, { 
            leadId: lead.id,
            name: mappedLead.fullName,
            email: mappedLead.email,
            isSpam: spamInfo.isLikelySpam
          });
          
          console.log(`Successfully reprocessed B2B lead ${lead.id} (test only)`);
          processedCount++;
        } else {
          // Mark lead as processed only if it wasn't processed before
          await markLeadAsProcessed(lead, mappedLead, spamInfo);
          processedCount++;
          
          log('SUCCESS', `Processed B2B lead`, { 
            leadId: lead.id,
            name: mappedLead.fullName,
            email: mappedLead.email,
            isSpam: spamInfo.isLikelySpam
          });
          
          console.log(`Successfully processed B2B lead ${lead.id}`);
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log('ERROR', `Error processing B2B lead`, {
          error: error.message,
          leadId: lead.id
        });
        console.error(`Error processing B2B lead ${lead.id}:`, error.message);
        // Continue with next lead even if one fails
      }
    }
    
    return processedCount;
  } catch (error) {
    log('ERROR', `Error processing B2B leads`, {
      error: error.message,
      formId: FORM_ID_B2B_NEW
    });
    console.error(`Error processing B2B leads:`, error.message);
    return 0;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting to process B2B New leads since March 6th, 2025');
    log('INFO', 'Starting to process B2B New leads', {
      cutoffDate: CUTOFF_DATE.toISOString()
    });
    
    // Process B2B leads from new form
    const processedCount = await processB2BNewLeads();
    
    log('SUCCESS', 'Completed processing B2B New leads', {
      processedCount
    });
    
    console.log(`Completed processing B2B New leads: ${processedCount} leads processed`);
  } catch (error) {
    log('ERROR', 'Error in main function', {
      error: error.message
    });
    console.error('Error in main function:', error.message);
  }
}

// Run the script
console.log('Running main()...');
main(); 
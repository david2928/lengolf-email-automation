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

    const { error } = await supabase
      .from('processed_leads')
      .insert(record);
    
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
        let spamInfo = { score: 0, reasons: [], isLikelySpam: false };
        if (type === 'B2B') {
          spamInfo = await b2bProcessor.process(mappedLead);
        } else {
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
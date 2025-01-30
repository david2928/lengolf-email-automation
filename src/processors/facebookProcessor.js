const { google } = require('googleapis');
const { FacebookB2BProcessor } = require('./facebookB2BProcessor');
const { FacebookB2CProcessor } = require('./facebookB2CProcessor');
const { MetaLeadService } = require('../services/metaLeadService');
const { supabase } = require('../lib/supabase');
const { log } = require('../utils/logging');

class FacebookProcessor {
    constructor(gmailService) {
        this.auth = gmailService.auth;
        this.b2bProcessor = new FacebookB2BProcessor(gmailService);
        this.b2cProcessor = new FacebookB2CProcessor(gmailService);
        this.metaService = new MetaLeadService();
        this.sheetId = process.env.FACEBOOK_SHEET_ID;
        this.b2bSheetId = process.env.FACEBOOK_B2B_SHEET_ID;
    }

    async setupSheetsClient() {
        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        } catch (error) {
            log('ERROR', 'Error setting up Sheets client', { error: error.message });
            throw error;
        }
    }

    async checkLeadExists(leadId) {
        const { data, error } = await supabase
            .from('processed_leads')
            .select('lead_id')
            .eq('lead_id', leadId)
            .single();

        if (error && error.code !== 'PGRST116') {
            log('ERROR', 'Error checking lead existence', { error: error.message, leadId });
            throw error;
        }

        return !!data;
    }

    async addToSupabase(data, leadDetails, processedLead) {
        try {
            // Determine form type based on form ID
            const formType = data.form_id === '562422893450533' ? 'B2B (New)' :
                           data.form_id === '905376497889703' ? 'B2B (Old)' :
                           data.form_id === '625669719834512' ? 'B2C (New)' :
                           data.form_id === '1067700894958557' ? 'B2C (Old)' : 'Unknown';

            const { error } = await supabase
                .from('processed_leads')
                .insert({
                    lead_id: data.id,
                    lead_type: processedLead.type.toLowerCase(),
                    meta_submitted_at: data.created_time,
                    form_type: formType,
                    form_id: data.form_id,
                    created_time: data.created_time,
                    processed_at: new Date().toISOString(),
                    platform: data.platform || '',
                    ad_id: data.ad_id || '',
                    ad_set_id: data.adset_id || '',
                    campaign_id: data.campaign_id || '',

                    // Basic Contact Information
                    full_name: leadDetails.fullName,
                    email: leadDetails.email,
                    phone_number: leadDetails.phoneNumber,
                    
                    // B2B Specific Fields
                    company_name: leadDetails.companyName,
                    event_type: leadDetails.eventType,
                    preferred_event_date: leadDetails.preferredDate,
                    event_planning_timeline: leadDetails.eventPlanningTimeline,
                    expected_attendees: leadDetails.expectedAttendees,
                    event_group_type: leadDetails.eventGroupType,
                    budget_per_person: leadDetails.budgetPerPerson,
                    additional_activities: leadDetails.additionalActivities,
                    interested_activities: leadDetails.interestedActivities,
                    
                    // B2C Specific Fields
                    previous_lengolf_experience: leadDetails.previousLengolfExperience,
                    group_size: leadDetails.groupSize,
                    preferred_time: leadDetails.preferredTime,
                    planned_visit: leadDetails.plannedVisit,
                    additional_inquiries: leadDetails.additionalInquiries,
                    
                    // Spam Detection
                    spam_score: processedLead.spamScore,
                    spam_reasons: processedLead.spamReasons,
                    is_likely_spam: processedLead.isLikelySpam,
                    
                    raw_fields: data.field_data
                });

            if (error) {
                throw error;
            }
            log('INFO', 'Added lead to Supabase', { 
                leadId: data.id,
                fullName: leadDetails.fullName,
                formType
            });
        } catch (error) {
            log('ERROR', 'Error adding to Supabase', { 
                error: error.message,
                leadId: data.id
            });
            throw error;
        }
    }

    async addToSheet(data) {
        try {
            if (!this.sheets) await this.setupSheetsClient();

            const mainSheetValues = [
                data.isB2B ? 'Facebook B2B' : 'Facebook B2C',  // Lead Source
                data.createdTime,                              // Created Time
                data.fullName,                                 // Full Name
                data.phoneNumber,                              // Phone Number
                data.email                                     // Email
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Sheet1!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [mainSheetValues] }
            });

            if (data.isB2B && this.b2bSheetId) {
                const b2bSheetValues = [
                    data.companyName || '',           // Company
                    data.fullName || '',              // Contact Name
                    data.phoneNumber || '',           // Contact Number
                    data.email || '',                 // Contact Email
                    'Facebook Lead',                  // Contact Via
                    'Received'                        // Status
                ];

                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.b2bSheetId,
                    range: 'Sheet1!A:F',              // Updated range to only include first 6 columns
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [b2bSheetValues] }
                });
            }
            log('INFO', 'Added lead to Google Sheets', { 
                fullName: data.fullName,
                isB2B: data.isB2B
            });
            return true;
        } catch (error) {
            log('ERROR', 'Error adding to sheet(s)', { 
                error: error.message,
                fullName: data.fullName
            });
            throw error;
        }
    }

    async processNewLeads() {
        try {
            const formIds = {
                b2b: {
                    new: '562422893450533',
                    old: '905376497889703'
                },
                b2c: {
                    new: '625669719834512',
                    old: '1067700894958557'
                }
            };

            log('INFO', 'Starting Facebook lead processing');

            const processLeadType = async (type, formIds, processor) => {
                let processedCount = 0;
                let spamCount = 0;
                let totalLeads = 0;
                let notificationErrors = 0;
                
                for (const [formKey, formId] of Object.entries(formIds)) {
                    const leads = await this.metaService.getNewLeads(formId);
                    totalLeads += leads.length;

                    for (const lead of leads) {
                        try {
                            const exists = await this.checkLeadExists(lead.id);
                            if (!exists) {
                                const leadDetails = await this.metaService.getLeadDetails(lead.id);
                                log('INFO', `Processing ${type.toUpperCase()} lead`, { 
                                    fullName: leadDetails.fullName,
                                    leadId: lead.id
                                });
                                
                                // Process lead first to get spam score
                                const processedLead = await processor.process(leadDetails, true); // true = skip LINE notification
                                
                                // Add to Supabase regardless of spam status
                                await this.addToSupabase(lead, leadDetails, processedLead);

                                if (processedLead.isLikelySpam) {
                                    log('INFO', 'Skipped spam lead', {
                                        fullName: leadDetails.fullName,
                                        leadId: lead.id,
                                        spamScore: processedLead.spamScore
                                    });
                                    spamCount++;
                                    continue;
                                }

                                // Try to send LINE notification but continue if it fails
                                try {
                                    await processor.sendNotification(leadDetails, processedLead);
                                    log('INFO', 'Sent LINE notification', {
                                        fullName: leadDetails.fullName,
                                        leadId: lead.id
                                    });
                                } catch (notifyError) {
                                    notificationErrors++;
                                    log('WARNING', 'Failed to send LINE notification but continuing processing', {
                                        error: notifyError.message,
                                        fullName: leadDetails.fullName,
                                        leadId: lead.id
                                    });
                                }
                                
                                await this.addToSheet({
                                    ...leadDetails,
                                    ...processedLead,
                                    isB2B: type === 'b2b'
                                });
                                
                                processedCount++;
                            }
                        } catch (error) {
                            log('ERROR', `Error processing ${type} lead`, {
                                error: error.message,
                                leadId: lead.id
                            });
                        }
                    }
                }
                if (totalLeads > 0) {
                    log('INFO', `${type.toUpperCase()} lead processing summary`, {
                        totalLeads,
                        processedCount,
                        spamCount,
                        notificationErrors,
                        existingLeads: totalLeads - processedCount - spamCount
                    });
                }
            };

            await processLeadType('b2b', formIds.b2b, this.b2bProcessor);
            await processLeadType('b2c', formIds.b2c, this.b2cProcessor);

            log('INFO', 'Facebook lead processing completed');
        } catch (error) {
            log('ERROR', 'Error in Facebook processor', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = { FacebookProcessor };

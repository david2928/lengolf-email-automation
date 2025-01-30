require('dotenv').config();
const { MetaLeadService } = require('../services/metaLeadService');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { supabase } = require('../lib/supabase');
const fs = require('fs').promises;
const path = require('path');
const { Parser } = require('json2csv');

async function insertLeadToDb(leadData, spamInfo) {
    const {
        'Form Type': formType,
        'Form ID': formId,
        'Lead ID': leadId,
        'Created Time': createdTime,
        'Platform': platform,
        'Ad ID': adId,
        'Ad Set ID': adSetId,
        'Campaign ID': campaignId,
        'Full Name': fullName,
        'Email': email,
        'Phone Number': phoneNumber,
        'Company Name': companyName,
        'Event Type': eventType,
        'Preferred Event Date': preferredEventDate,
        'Event Planning Timeline': eventPlanningTimeline,
        'Expected Attendees': expectedAttendees,
        'Event Group Type': eventGroupType,
        'Budget Per Person': budgetPerPerson,
        'Additional Activities': additionalActivities,
        'Interested Activities': interestedActivities,
        'Previous LenGolf Experience': previousExperience,
        'Group Size': groupSize,
        'Preferred Time': preferredTime,
        'Planned Visit': plannedVisit,
        'Additional Inquiries': additionalInquiries,
        'Raw Fields': rawFields
    } = leadData;

    const leadType = formType.toLowerCase().includes('b2b') ? 'b2b' : 'b2c';

    const { error } = await supabase
        .from('processed_leads')
        .upsert({
            lead_id: leadId,
            form_type: formType,
            form_id: formId,
            created_time: createdTime,
            meta_submitted_at: createdTime,
            processed_at: new Date().toISOString(),
            platform,
            ad_id: adId,
            ad_set_id: adSetId,
            campaign_id: campaignId,
            full_name: fullName,
            email,
            phone_number: phoneNumber,
            company_name: companyName,
            event_type: eventType,
            preferred_event_date: preferredEventDate,
            event_planning_timeline: eventPlanningTimeline,
            expected_attendees: expectedAttendees,
            event_group_type: eventGroupType,
            budget_per_person: budgetPerPerson,
            additional_activities: additionalActivities,
            interested_activities: interestedActivities,
            previous_lengolf_experience: previousExperience,
            group_size: groupSize,
            preferred_time: preferredTime,
            planned_visit: plannedVisit,
            additional_inquiries: additionalInquiries,
            raw_fields: rawFields,
            spam_score: spamInfo.score,
            spam_reasons: spamInfo.reasons,
            is_likely_spam: spamInfo.isLikelySpam,
            lead_type: leadType
        }, {
            onConflict: 'lead_id',
            ignoreDuplicates: false
        });

    if (error) {
        console.error('Error inserting lead:', error);
        throw error;
    }
}

async function extractAllLeads() {
    const metaService = new MetaLeadService();
    const forms = [
        { id: '625669719834512', type: 'B2C (New)' },
        { id: '562422893450533', type: 'B2B (New)' },
        { id: '1067700894958557', type: 'B2C (Old)' },
        { id: '905376497889703', type: 'B2B (Old)' }
    ];

    const outputDir = path.join(__dirname, '..', '..', 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const allLeadsData = [];

    try {
        for (const form of forms) {
            console.log(`\nFetching leads from ${form.type} form (ID: ${form.id})`);
            const leads = await metaService.getNewLeads(form.id);
            
            console.log(`Found ${leads.length} leads for ${form.type}`);
            
            for (const lead of leads) {
                const leadDetails = await metaService.getLeadDetails(lead.id);
                
                // Helper function to get value from raw fields
                const getFieldValue = (fieldName) => {
                    const field = leadDetails.rawFields.find(f => f.name === fieldName);
                    return field ? field.values[0] : '';
                };

                // Store all information about the lead
                const leadData = {
                    // Meta Information
                    'Form Type': form.type,
                    'Form ID': form.id,
                    'Lead ID': lead.id,
                    'Created Time': lead.created_time,
                    'Created Time (Local)': new Date(lead.created_time).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
                    'Platform': lead.platform || '',
                    'Ad ID': lead.ad_id || '',
                    'Ad Set ID': lead.adset_id || '',
                    'Campaign ID': lead.campaign_id || '',

                    // Basic Contact Information
                    'Full Name': getFieldValue('full_name'),
                    'Email': getFieldValue('email'),
                    'Phone Number': getFieldValue('phone_number'),
                    
                    // B2B Specific Fields
                    'Company Name': getFieldValue('company_name'),
                    'Event Type': getFieldValue('what_kind_of_events/party/team-building_are_you_looking_for?'),
                    'Preferred Event Date': getFieldValue('when_do_you_prefer_to_host_an_event_(dd/mm/yyyy)_put_n/a_if_do_not_know'),
                    'Event Planning Timeline': getFieldValue('does_your_company_plan_to_host_an_event_in_the_next_3_months'),
                    'Expected Attendees': getFieldValue('how_many_people_are_you_expecting_for_your_event?'),
                    'Event Group Type': getFieldValue('is_this_event_for_a_company_or_a_private_group?'),
                    'Budget Per Person': getFieldValue('what_is_your_estimated_budget_per_person?'),
                    'Additional Activities': getFieldValue('would_you_like_to_include_additional_activities_or_entertainment?_(for_example,_putting_challenge,_vr_experiences,_golf_pro_lesson,_karaoke,_other)'),
                    'Interested Activities': getFieldValue('select_the_activities_you_are_interested_in'),

                    // B2C Specific Fields
                    'Previous LenGolf Experience': getFieldValue('have_you_ever_been_to_lengolf?'),
                    'Group Size': getFieldValue('how_many_people_are_coming?'),
                    'Preferred Time': getFieldValue('what_time_of_day_works_best_for_you?'),
                    'Planned Visit': getFieldValue('when_are_you_planning_to_visit_us?'),
                    'Additional Inquiries': getFieldValue('what\'s_other_thing_you\'d_like_to_know_about_our_services?'),

                    // Store raw fields for reference
                    'Raw Fields': leadDetails.rawFields
                };

                // Calculate spam score
                const spamInfo = calculateSpamScore({
                    email: leadData['Email'],
                    fullName: leadData['Full Name'],
                    phoneNumber: leadData['Phone Number'],
                    createdTime: leadData['Created Time']
                });

                // Insert into database
                await insertLeadToDb(leadData, spamInfo);

                // Add spam information to the lead data for CSV/JSON export
                leadData['Spam Score'] = spamInfo.score;
                leadData['Spam Reasons'] = spamInfo.reasons.join(', ');
                leadData['Is Likely Spam'] = spamInfo.isLikelySpam;

                allLeadsData.push(leadData);
                
                // Log progress
                console.log(`Processed lead ${lead.id} from ${form.type} (Spam Score: ${spamInfo.score})`);
            }
        }

        // Save to CSV and JSON as before
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Save JSON
        const jsonFile = path.join(outputDir, `all_leads_${timestamp}.json`);
        await fs.writeFile(jsonFile, JSON.stringify(allLeadsData, null, 2));

        // Save CSV
        const csvParser = new Parser({
            fields: Object.keys(allLeadsData[0]).filter(field => field !== 'Raw Fields')
        });
        const csv = csvParser.parse(allLeadsData);
        const csvFile = path.join(outputDir, `all_leads_${timestamp}.csv`);
        await fs.writeFile(csvFile, csv);

        console.log(`\nExtraction complete!`);
        console.log(`Total leads extracted: ${allLeadsData.length}`);
        console.log(`Data saved to:`);
        console.log(`- JSON: ${jsonFile}`);
        console.log(`- CSV: ${csvFile}`);
        console.log(`- Database: processed_leads table in Supabase`);

        // Print spam statistics
        const spamLeads = allLeadsData.filter(lead => lead['Is Likely Spam']);
        console.log(`\nSpam Detection Results:`);
        console.log(`- Total Leads: ${allLeadsData.length}`);
        console.log(`- Likely Spam: ${spamLeads.length}`);
        console.log(`- Spam Percentage: ${((spamLeads.length / allLeadsData.length) * 100).toFixed(1)}%`);

    } catch (error) {
        console.error('Error processing leads:', error.message);
        if (error.response?.data) {
            console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the extraction
extractAllLeads(); 

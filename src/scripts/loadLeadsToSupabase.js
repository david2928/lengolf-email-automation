require('dotenv').config();
const { MetaLeadService } = require('../services/metaLeadService');
const { supabase } = require('../lib/supabase');
const { calculateSpamScore } = require('../utils/fraudDetection');

// Form IDs from the CSV data
const FORM_IDS = {
    B2B_NEW: '562422893450533',
    B2B_OLD: '905376497889703',
    B2C_NEW: '625669719834512',
    B2C_OLD: '1067700894958557'
};

async function verifySupabaseCount() {
    const { data, error, count } = await supabase
        .from('processed_leads')
        .select('*', { count: 'exact' });
    
    if (error) {
        console.error('Error verifying Supabase count:', error);
        return null;
    }
    
    return count;
}

async function loadLeadsToSupabase() {
    const metaService = new MetaLeadService();
    let totalLeadsProcessed = 0;
    let duplicateLeads = 0;
    let insertErrors = 0;

    // Track statistics per form
    const stats = {
        [FORM_IDS.B2B_NEW]: { retrieved: 0, inserted: 0, duplicates: 0, errors: 0, name: 'B2B (New)' },
        [FORM_IDS.B2B_OLD]: { retrieved: 0, inserted: 0, duplicates: 0, errors: 0, name: 'B2B (Old)' },
        [FORM_IDS.B2C_NEW]: { retrieved: 0, inserted: 0, duplicates: 0, errors: 0, name: 'B2C (New)' },
        [FORM_IDS.B2C_OLD]: { retrieved: 0, inserted: 0, duplicates: 0, errors: 0, name: 'B2C (Old)' }
    };

    try {
        // Truncate the table first
        console.log('Truncating processed_leads table...');
        const { error: truncateError } = await supabase
            .from('processed_leads')
            .delete()
            .neq('id', 0);

        if (truncateError) {
            console.error('Error truncating table:', truncateError);
            process.exit(1);
        }
        console.log('Table truncated successfully');

        // Load B2B leads (both new and old forms)
        console.log('\nLoading B2B leads...');
        const b2bNewLeads = await metaService.getNewLeads(FORM_IDS.B2B_NEW);
        const b2bOldLeads = await metaService.getNewLeads(FORM_IDS.B2B_OLD);
        stats[FORM_IDS.B2B_NEW].retrieved = b2bNewLeads.length;
        stats[FORM_IDS.B2B_OLD].retrieved = b2bOldLeads.length;

        // Load B2C leads (both new and old forms)
        console.log('\nLoading B2C leads...');
        const b2cNewLeads = await metaService.getNewLeads(FORM_IDS.B2C_NEW);
        const b2cOldLeads = await metaService.getNewLeads(FORM_IDS.B2C_OLD);
        stats[FORM_IDS.B2C_NEW].retrieved = b2cNewLeads.length;
        stats[FORM_IDS.B2C_OLD].retrieved = b2cOldLeads.length;

        // Helper function to get field value
        const getFieldValue = (fieldData, fieldName) => {
            const field = fieldData.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
            return field ? field.values[0] : '';
        };

        // Helper function to get form ID
        const getFormId = (formType) => {
            switch(formType) {
                case 'B2B (New)': return FORM_IDS.B2B_NEW;
                case 'B2B (Old)': return FORM_IDS.B2B_OLD;
                case 'B2C (New)': return FORM_IDS.B2C_NEW;
                case 'B2C (Old)': return FORM_IDS.B2C_OLD;
                default: return '';
            }
        };

        // Process and insert B2B leads
        console.log('\nProcessing B2B leads...');
        let processedCount = 0;
        const totalB2BLeads = b2bNewLeads.length + b2bOldLeads.length;
        
        // Process new B2B leads
        for (const lead of b2bNewLeads) {
            const formId = FORM_IDS.B2B_NEW;
            const formType = 'B2B (New)';
            
            try {
                // Extract basic information for spam detection
                const fullName = getFieldValue(lead.field_data, 'full_name');
                const email = getFieldValue(lead.field_data, 'email');
                const phoneNumber = getFieldValue(lead.field_data, 'phone_number');

                // Calculate spam score
                const spamInfo = calculateSpamScore({
                    email,
                    fullName,
                    phoneNumber,
                    createdTime: lead.created_time
                });
                
                const { error } = await supabase
                    .from('processed_leads')
                    .upsert({
                        lead_id: lead.id,
                        lead_type: 'b2b',
                        meta_submitted_at: lead.created_time,
                        form_type: formType,
                        form_id: formId,
                        created_time: lead.created_time,
                        processed_at: new Date().toISOString(),
                        platform: lead.platform || '',
                        ad_id: lead.ad_id || '',
                        ad_set_id: lead.adset_id || '',
                        campaign_id: lead.campaign_id || '',

                        // Basic Contact Information
                        full_name: fullName,
                        email: email,
                        phone_number: phoneNumber,
                        
                        // B2B Specific Fields
                        company_name: getFieldValue(lead.field_data, 'company_name'),
                        event_type: getFieldValue(lead.field_data, 'what_kind_of_events/party/team-building_are_you_looking_for?'),
                        preferred_event_date: getFieldValue(lead.field_data, 'when_do_you_prefer_to_host_an_event_(dd/mm/yyyy)_put_n/a_if_do_not_know'),
                        event_planning_timeline: getFieldValue(lead.field_data, 'does_your_company_plan_to_host_an_event_in_the_next_3_months'),
                        expected_attendees: getFieldValue(lead.field_data, 'how_many_people_are_you_expecting_for_your_event?'),
                        event_group_type: getFieldValue(lead.field_data, 'is_this_event_for_a_company_or_a_private_group?'),
                        budget_per_person: getFieldValue(lead.field_data, 'what_is_your_estimated_budget_per_person?'),
                        additional_activities: getFieldValue(lead.field_data, 'would_you_like_to_include_additional_activities_or_entertainment?_(for_example,_putting_challenge,_vr_experiences,_golf_pro_lesson,_karaoke,_other)'),
                        interested_activities: getFieldValue(lead.field_data, 'select_the_activities_you_are_interested_in'),
                        
                        // Spam Detection
                        spam_score: spamInfo.score,
                        spam_reasons: spamInfo.reasons,
                        is_likely_spam: spamInfo.isLikelySpam,
                        
                        raw_fields: lead.field_data
                    }, {
                        onConflict: 'lead_id',
                        ignoreDuplicates: false
                    });

                if (error) {
                    if (error.code === '23505') {
                        duplicateLeads++;
                        stats[formId].duplicates++;
                        console.log(`Duplicate B2B lead found: ${lead.id}`);
                    } else {
                        insertErrors++;
                        stats[formId].errors++;
                        console.error(`Error inserting B2B lead: ${lead.id}`, error);
                    }
                } else {
                    stats[formId].inserted++;
                    totalLeadsProcessed++;
                }
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`Processed ${processedCount}/${totalB2BLeads} B2B leads`);
                }
            } catch (err) {
                console.error(`Failed to process B2B lead ${lead.id}:`, err);
            }
        }

        // Process old B2B leads
        for (const lead of b2bOldLeads) {
            const formId = FORM_IDS.B2B_OLD;
            const formType = 'B2B (Old)';
            
            try {
                // Extract basic information for spam detection
                const fullName = getFieldValue(lead.field_data, 'full_name');
                const email = getFieldValue(lead.field_data, 'email');
                const phoneNumber = getFieldValue(lead.field_data, 'phone_number');

                // Calculate spam score
                const spamInfo = calculateSpamScore({
                    email,
                    fullName,
                    phoneNumber,
                    createdTime: lead.created_time
                });
                
                const { error } = await supabase
                    .from('processed_leads')
                    .upsert({
                        lead_id: lead.id,
                        lead_type: 'b2b',
                        meta_submitted_at: lead.created_time,
                        form_type: formType,
                        form_id: formId,
                        created_time: lead.created_time,
                        processed_at: new Date().toISOString(),
                        platform: lead.platform || '',
                        ad_id: lead.ad_id || '',
                        ad_set_id: lead.adset_id || '',
                        campaign_id: lead.campaign_id || '',

                        // Basic Contact Information
                        full_name: fullName,
                        email: email,
                        phone_number: phoneNumber,
                        
                        // B2B Specific Fields
                        company_name: getFieldValue(lead.field_data, 'company_name'),
                        event_type: getFieldValue(lead.field_data, 'what_kind_of_events/party/team-building_are_you_looking_for?'),
                        preferred_event_date: getFieldValue(lead.field_data, 'when_do_you_prefer_to_host_an_event_(dd/mm/yyyy)_put_n/a_if_do_not_know'),
                        event_planning_timeline: getFieldValue(lead.field_data, 'does_your_company_plan_to_host_an_event_in_the_next_3_months'),
                        expected_attendees: getFieldValue(lead.field_data, 'how_many_people_are_you_expecting_for_your_event?'),
                        event_group_type: getFieldValue(lead.field_data, 'is_this_event_for_a_company_or_a_private_group?'),
                        budget_per_person: getFieldValue(lead.field_data, 'what_is_your_estimated_budget_per_person?'),
                        additional_activities: getFieldValue(lead.field_data, 'would_you_like_to_include_additional_activities_or_entertainment?_(for_example,_putting_challenge,_vr_experiences,_golf_pro_lesson,_karaoke,_other)'),
                        interested_activities: getFieldValue(lead.field_data, 'select_the_activities_you_are_interested_in'),
                        
                        // Spam Detection
                        spam_score: spamInfo.score,
                        spam_reasons: spamInfo.reasons,
                        is_likely_spam: spamInfo.isLikelySpam,
                        
                        raw_fields: lead.field_data
                    }, {
                        onConflict: 'lead_id',
                        ignoreDuplicates: false
                    });

                if (error) {
                    if (error.code === '23505') {
                        duplicateLeads++;
                        stats[formId].duplicates++;
                        console.log(`Duplicate B2B lead found: ${lead.id}`);
                    } else {
                        insertErrors++;
                        stats[formId].errors++;
                        console.error(`Error inserting B2B lead: ${lead.id}`, error);
                    }
                } else {
                    stats[formId].inserted++;
                    totalLeadsProcessed++;
                }
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`Processed ${processedCount}/${totalB2BLeads} B2B leads`);
                }
            } catch (err) {
                console.error(`Failed to process B2B lead ${lead.id}:`, err);
            }
        }
        console.log(`Completed processing ${processedCount}/${totalB2BLeads} B2B leads`);

        // Process and insert B2C leads
        console.log('\nProcessing B2C leads...');
        processedCount = 0;
        const totalB2CLeads = b2cNewLeads.length + b2cOldLeads.length;
        
        // Process new B2C leads
        for (const lead of b2cNewLeads) {
            const formId = FORM_IDS.B2C_NEW;
            const formType = 'B2C (New)';
            
            try {
                // Extract basic information for spam detection
                const fullName = getFieldValue(lead.field_data, 'full_name');
                const email = getFieldValue(lead.field_data, 'email');
                const phoneNumber = getFieldValue(lead.field_data, 'phone_number');

                // Calculate spam score
                const spamInfo = calculateSpamScore({
                    email,
                    fullName,
                    phoneNumber,
                    createdTime: lead.created_time
                });
                
                const { error } = await supabase
                    .from('processed_leads')
                    .upsert({
                        lead_id: lead.id,
                        lead_type: 'b2c',
                        meta_submitted_at: lead.created_time,
                        form_type: formType,
                        form_id: formId,
                        created_time: lead.created_time,
                        processed_at: new Date().toISOString(),
                        platform: lead.platform || '',
                        ad_id: lead.ad_id || '',
                        ad_set_id: lead.adset_id || '',
                        campaign_id: lead.campaign_id || '',

                        // Basic Contact Information
                        full_name: fullName,
                        email: email,
                        phone_number: phoneNumber,
                        
                        // B2C Specific Fields
                        previous_lengolf_experience: getFieldValue(lead.field_data, 'have_you_ever_been_to_lengolf?'),
                        group_size: getFieldValue(lead.field_data, 'how_many_people_are_coming?'),
                        preferred_time: getFieldValue(lead.field_data, 'what_time_of_day_works_best_for_you?'),
                        planned_visit: getFieldValue(lead.field_data, 'when_are_you_planning_to_visit_us?'),
                        additional_inquiries: getFieldValue(lead.field_data, 'what\'s_other_thing_you\'d_like_to_know_about_our_services?'),
                        
                        // Spam Detection
                        spam_score: spamInfo.score,
                        spam_reasons: spamInfo.reasons,
                        is_likely_spam: spamInfo.isLikelySpam,
                        
                        raw_fields: lead.field_data
                    }, {
                        onConflict: 'lead_id',
                        ignoreDuplicates: false
                    });

                if (error) {
                    if (error.code === '23505') {
                        duplicateLeads++;
                        stats[formId].duplicates++;
                        console.log(`Duplicate B2C lead found: ${lead.id}`);
                    } else {
                        insertErrors++;
                        stats[formId].errors++;
                        console.error(`Error inserting B2C lead: ${lead.id}`, error);
                    }
                } else {
                    stats[formId].inserted++;
                    totalLeadsProcessed++;
                }
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`Processed ${processedCount}/${totalB2CLeads} B2C leads`);
                }
            } catch (err) {
                console.error(`Failed to process B2C lead ${lead.id}:`, err);
            }
        }

        // Process old B2C leads
        for (const lead of b2cOldLeads) {
            const formId = FORM_IDS.B2C_OLD;
            const formType = 'B2C (Old)';
            
            try {
                // Extract basic information for spam detection
                const fullName = getFieldValue(lead.field_data, 'full_name');
                const email = getFieldValue(lead.field_data, 'email');
                const phoneNumber = getFieldValue(lead.field_data, 'phone_number');

                // Calculate spam score
                const spamInfo = calculateSpamScore({
                    email,
                    fullName,
                    phoneNumber,
                    createdTime: lead.created_time
                });
                
                const { error } = await supabase
                    .from('processed_leads')
                    .upsert({
                        lead_id: lead.id,
                        lead_type: 'b2c',
                        meta_submitted_at: lead.created_time,
                        form_type: formType,
                        form_id: formId,
                        created_time: lead.created_time,
                        processed_at: new Date().toISOString(),
                        platform: lead.platform || '',
                        ad_id: lead.ad_id || '',
                        ad_set_id: lead.adset_id || '',
                        campaign_id: lead.campaign_id || '',

                        // Basic Contact Information
                        full_name: fullName,
                        email: email,
                        phone_number: phoneNumber,
                        
                        // B2C Specific Fields
                        previous_lengolf_experience: getFieldValue(lead.field_data, 'have_you_ever_been_to_lengolf?'),
                        group_size: getFieldValue(lead.field_data, 'how_many_people_are_coming?'),
                        preferred_time: getFieldValue(lead.field_data, 'what_time_of_day_works_best_for_you?'),
                        planned_visit: getFieldValue(lead.field_data, 'when_are_you_planning_to_visit_us?'),
                        additional_inquiries: getFieldValue(lead.field_data, 'what\'s_other_thing_you\'d_like_to_know_about_our_services?'),
                        
                        // Spam Detection
                        spam_score: spamInfo.score,
                        spam_reasons: spamInfo.reasons,
                        is_likely_spam: spamInfo.isLikelySpam,
                        
                        raw_fields: lead.field_data
                    }, {
                        onConflict: 'lead_id',
                        ignoreDuplicates: false
                    });

                if (error) {
                    if (error.code === '23505') {
                        duplicateLeads++;
                        stats[formId].duplicates++;
                        console.log(`Duplicate B2C lead found: ${lead.id}`);
                    } else {
                        insertErrors++;
                        stats[formId].errors++;
                        console.error(`Error inserting B2C lead: ${lead.id}`, error);
                    }
                } else {
                    stats[formId].inserted++;
                    totalLeadsProcessed++;
                }
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`Processed ${processedCount}/${totalB2CLeads} B2C leads`);
                }
            } catch (err) {
                console.error(`Failed to process B2C lead ${lead.id}:`, err);
            }
        }
        console.log(`Completed processing ${processedCount}/${totalB2CLeads} B2C leads`);

        // Verify final count in Supabase
        const finalCount = await verifySupabaseCount();

        console.log('\n===========================================');
        console.log('Detailed Statistics by Form:');
        console.log('===========================================');
        for (const [formId, formStats] of Object.entries(stats)) {
            console.log(`\n${formStats.name} (${formId}):`);
            console.log(`- Retrieved from Meta: ${formStats.retrieved}`);
            console.log(`- Successfully inserted: ${formStats.inserted}`);
            console.log(`- Duplicates: ${formStats.duplicates}`);
            console.log(`- Errors: ${formStats.errors}`);
        }

        console.log('\n===========================================');
        console.log('Overall Summary:');
        console.log('===========================================');
        console.log(`Total B2B leads from Meta: ${stats[FORM_IDS.B2B_NEW].retrieved + stats[FORM_IDS.B2B_OLD].retrieved}`);
        console.log(`Total B2C leads from Meta: ${stats[FORM_IDS.B2C_NEW].retrieved + stats[FORM_IDS.B2C_OLD].retrieved}`);
        console.log(`Total leads from Meta: ${Object.values(stats).reduce((sum, s) => sum + s.retrieved, 0)}`);
        console.log(`Total leads inserted: ${totalLeadsProcessed}`);
        console.log(`Total duplicates: ${duplicateLeads}`);
        console.log(`Total errors: ${insertErrors}`);
        console.log(`Final count in Supabase: ${finalCount}`);
        
        if (finalCount !== totalLeadsProcessed) {
            console.warn('\nWARNING: Mismatch between processed leads and Supabase count!');
            console.warn(`Processed: ${totalLeadsProcessed}, In Supabase: ${finalCount}`);
        }

        // Exit with success
        console.log('\nScript completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error loading leads to Supabase:', error);
        console.error('Error details:', error.response?.data || error);
        process.exit(1);
    }
}

// Run only if directly executed
if (require.main === module) {
    loadLeadsToSupabase();
} 

const axios = require('axios');

class MetaLeadService {
    constructor() {
        this.accessToken = process.env.META_ACCESS_TOKEN;
        this.pageId = process.env.META_PAGE_ID;
        this.baseUrl = 'https://graph.facebook.com/v18.0';
    }

    async getNewLeads(formId) {
        try {
            let allLeads = [];
            let nextPage = `${this.baseUrl}/${formId}/leads?access_token=${this.accessToken}`;

            while (nextPage) {
                const response = await axios.get(nextPage);
                const { data, paging } = response.data;
                allLeads = allLeads.concat(data.map(lead => ({
                    ...lead,
                    form_id: formId // Add form ID to each lead
                })));
                nextPage = paging?.next;
            }

            return allLeads;
        } catch (error) {
            console.error('Error fetching leads:', error);
            throw error;
        }
    }

    async getLeadDetails(leadId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${leadId}?access_token=${this.accessToken}`
            );

            const lead = response.data;
            const fieldData = lead.field_data || [];
            
            // Extract field values
            const getFieldValue = (name) => {
                const field = fieldData.find(f => f.name === name);
                return field ? field.values[0] : '';
            };

            return {
                fullName: getFieldValue('full_name'),
                email: getFieldValue('email'),
                phoneNumber: getFieldValue('phone_number'),
                companyName: getFieldValue('company_name'),
                
                // B2B fields with exact names
                eventType: getFieldValue('what_kind_of_events/party/team-building_are_you_looking_for?'),
                preferredDate: getFieldValue('when_do_you_prefer_to_host_an_event_(dd/mm/yyyy)_put_n/a_if_do_not_know'),
                eventPlanningTimeline: getFieldValue('does_your_company_plan_to_host_an_event_in_the_next_3_months'),
                expectedAttendees: getFieldValue('how_many_people_are_you_expecting_for_your_event?'),
                eventGroupType: getFieldValue('is_this_event_for_a_company_or_a_private_group?'),
                budgetPerPerson: getFieldValue('what_is_your_estimated_budget_per_person?'),
                additionalActivities: getFieldValue('would_you_like_to_include_additional_activities_or_entertainment?_(for_example,_putting_challenge,_vr_experiences,_golf_pro_lesson,_karaoke,_other)'),
                interestedActivities: getFieldValue('select_the_activities_you_are_interested_in'),
                
                // B2C fields with exact names
                previousLengolfExperience: getFieldValue('have_you_ever_been_to_lengolf?'),
                groupSize: getFieldValue('how_many_people_are_coming?'),
                preferredTime: getFieldValue('what_time_of_day_works_best_for_you?'),
                plannedVisit: getFieldValue('when_are_you_planning_to_visit_us?'),
                additionalInquiries: getFieldValue('what\'s_other_thing_you\'d_like_to_know_about_our_services?'),
                
                // Raw data for debugging
                createdTime: lead.created_time,
                rawFields: fieldData
            };
        } catch (error) {
            console.error('Error fetching lead details:', error);
            throw error;
        }
    }
}

module.exports = { MetaLeadService };
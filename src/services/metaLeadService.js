const axios = require('axios');

class MetaLeadService {
    constructor() {
        this.accessToken = process.env.META_ACCESS_TOKEN;
        this.baseUrl = 'https://graph.facebook.com/v19.0';
    }

    async getNewLeads(formId, since = null) {
        try {
            let allLeads = [];
            let nextPage = `${this.baseUrl}/${formId}/leads`;

            while (nextPage) {
                console.log(`Fetching leads from: ${nextPage}`);
                const response = await axios.get(nextPage, {
                    params: {
                        access_token: this.accessToken,
                        fields: 'id,created_time,field_data',
                        limit: 100,
                        ...(since && { since: since })
                    }
                });

                if (response.data.error) {
                    throw new Error(response.data.error.message);
                }

                allLeads = allLeads.concat(response.data.data);
                nextPage = response.data.paging?.next;
            }

            return allLeads;
        } catch (error) {
            console.error('Error fetching leads:', error.response?.data || error.message);
            throw error;
        }
    }

    async getLeadDetails(leadId) {
        try {
            const response = await axios.get(`${this.baseUrl}/${leadId}`, {
                params: {
                    access_token: this.accessToken,
                    fields: 'field_data,created_time,form_id'
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error.message);
            }

            const fieldData = response.data.field_data.reduce((acc, field) => {
                acc[field.name] = field.values[0];
                return acc;
            }, {});

            const isB2B = response.data.form_id === process.env.META_B2B_FORM_ID;

            return {
                createdTime: response.data.created_time,
                fullName: fieldData.full_name || fieldData['full name'],
                email: fieldData.email,
                phoneNumber: fieldData.phone || fieldData.phone_number || fieldData['phone number'],
                isB2B: isB2B,
                companyName: fieldData.company || fieldData.company_name || fieldData['company name'],
                preferredDate: fieldData.date || fieldData.preferred_date || fieldData['preferred date'],
                eventsDescription: fieldData.description || fieldData.events_description || fieldData['events description'],
                rawFields: fieldData
            };
        } catch (error) {
            console.error('Error fetching lead details:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = { MetaLeadService };
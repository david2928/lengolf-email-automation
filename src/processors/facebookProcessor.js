const { google } = require('googleapis');
const { FacebookB2BProcessor } = require('./facebookB2BProcessor');
const { FacebookB2CProcessor } = require('./facebookB2CProcessor');
const { MetaLeadService } = require('../services/metaLeadService');
const { MetaStorage } = require('../utils/metaStorage');

class FacebookProcessor {
    constructor(gmailService) {
        this.auth = gmailService.auth;
        this.b2bProcessor = new FacebookB2BProcessor(gmailService);
        this.b2cProcessor = new FacebookB2CProcessor(gmailService);
        this.metaService = new MetaLeadService();
        this.sheetId = process.env.FACEBOOK_SHEET_ID;
        this.b2bSheetId = process.env.FACEBOOK_B2B_SHEET_ID;
        this.storage = new MetaStorage();
    }

    async setupSheetsClient() {
        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            console.log('Successfully connected to Google Sheets');
        } catch (error) {
            console.error('Error setting up Sheets client:', error);
            throw error;
        }
    }

    async addToSheet(data) {
        try {
            if (!this.sheets) await this.setupSheetsClient();

            const mainSheetValues = [
                data.isB2B ? 'Facebook B2B' : 'Facebook B2C',
                data.createdTime,
                data.fullName,
                data.phoneNumber,
                data.email
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Sheet1!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [mainSheetValues] }
            });

            if (data.isB2B && this.b2bSheetId) {
                const b2bSheetValues = [
                    data.companyName || '',
                    data.fullName || '',
                    data.phoneNumber || '',
                    data.email || '',
                    'Facebook Lead',
                    'Received'
                ];

                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.b2bSheetId,
                    range: 'Sheet1!A:F',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [b2bSheetValues] }
                });
            }

            console.log('Successfully added lead to sheets');
            return true;
        } catch (error) {
            console.error('Error adding to sheet(s):', error);
            throw error;
        }
    }

    async processNewLeads() {
        try {
            await this.storage.initialize();
            const storedData = await this.storage.getStoredData();

            const processLeadType = async (type, formId, processor) => {
                const leads = await this.metaService.getNewLeads(formId);
                console.log(`Found ${leads.length} ${type} leads to check`);
                let processedCount = 0;

                for (const lead of leads) {
                    try {
                        if (!storedData[type].leads.includes(lead.id)) {
                            const leadDetails = await this.metaService.getLeadDetails(lead.id);
                            await processor.process(leadDetails);
                            await this.addToSheet({...leadDetails, isB2B: type === 'b2b'});
                            await this.storage.markLeadAsProcessed(lead.id, type);
                            processedCount++;
                        }
                    } catch (error) {
                        console.error(`Error processing ${type} lead ${lead.id}:`, error);
                    }
                }
                console.log(`Processed ${processedCount} new ${type} leads`);
            };

            await processLeadType('b2b', process.env.META_B2B_FORM_ID, this.b2bProcessor);
            await processLeadType('b2c', process.env.META_B2C_FORM_ID, this.b2cProcessor);

        } catch (error) {
            console.error('Error in Facebook processor:', error);
            throw error;
        }
    }
}

module.exports = { FacebookProcessor };
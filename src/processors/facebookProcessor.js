const { google } = require('googleapis');
const { extractPlainText } = require('../utils/emailUtils');
const { FacebookB2BProcessor } = require('./facebookB2BProcessor');
const { FacebookB2CProcessor } = require('./facebookB2CProcessor');

class FacebookProcessor {
    constructor(gmailService) {
        this.gmailService = gmailService;
        this.gmail = gmailService.gmail;
        this.auth = gmailService.auth;
        
        // Initialize B2B and B2C processors
        this.b2bProcessor = new FacebookB2BProcessor(gmailService);
        this.b2cProcessor = new FacebookB2CProcessor(gmailService);
        
        this.sourceLabel = process.env.LABEL_FACEBOOK;
        this.completedLabel = process.env.LABEL_COMPLETED;
        this.sheetId = process.env.FACEBOOK_SHEET_ID;
        this.b2bSheetId = process.env.FACEBOOK_B2B_SHEET_ID;
    }

    cleanValue(value) {
        if (!value) return null;
        return value
            .replace(/Best regards,?/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    extractLeadData(bodyText) {
        try {
            console.log('Processing raw body:', bodyText);

            // B2B detection
            const isB2B = bodyText.includes('B2B new lead') || 
                         bodyText.includes('company name:') ||
                         bodyText.includes('Events description:');

            // Common patterns
            const createdTimeMatch = bodyText.match(/Created time:\s*(\S+)/i);
            const fullNameMatch = bodyText.match(/Full name\s*:?\s*([^\n]+?)(?=\s*(?:Email|Phone|company name:|$))/i);
            const emailMatch = bodyText.match(/Email\s*:?\s*([\w.-]+@[\w.-]+\.\w+)/i);
            const phoneMatch = bodyText.match(/Phone number\s*:?\s*(\+?\d[\d\s\-()+]{7,}\d)/i);

            // B2B specific patterns
            const companyMatch = bodyText.match(/company name:\s*([^\n]+?)(?=\s*(?:preferred date:|email:|phone number:|$))/i);
            const preferredDateMatch = bodyText.match(/preferred date:\s*([^\n]+?)(?=\s*(?:events description:|email:|phone number:|$))/i);
            const eventsDescriptionMatch = bodyText.match(/Events description:\s*([^\n]+?)(?=\s*(?:Best regards,|email:|phone number:|$))/i);

            // Validate required fields
            if (!createdTimeMatch || !fullNameMatch || !emailMatch || !phoneMatch) {
                console.log('Missing required fields');
                return null;
            }

            // Create lead data object
            return {
                createdTime: createdTimeMatch[1].trim(),
                fullName: this.cleanValue(fullNameMatch[1]),
                email: emailMatch[1].trim(),
                phoneNumber: phoneMatch[1].trim(),
                isB2B: isB2B,
                companyName: companyMatch ? this.cleanValue(companyMatch[1]) : null,
                preferredDate: preferredDateMatch ? this.cleanValue(preferredDateMatch[1]) : null,
                eventsDescription: eventsDescriptionMatch ? this.cleanValue(eventsDescriptionMatch[1]) : null
            };
        } catch (error) {
            console.error('Error extracting Facebook lead data:', error);
            return null;
        }
    }

    async setupSheetsClient() {
        try {
            this.sheets = google.sheets({ 
                version: 'v4', 
                auth: this.auth
            });

            await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'A1:A1'
            });

            console.log('Successfully connected to Google Sheets');
        } catch (error) {
            console.error('Error setting up Sheets client:', error);
            throw error;
        }
    }

    async addToSheet(data) {
        try {
            if (!this.sheets) {
                await this.setupSheetsClient();
            }

            // Add to main tracking sheet - only columns A-E for both B2B and B2C
            const mainSheetValues = [
                data.isB2B ? 'Facebook B2B' : 'Facebook B2C',  // A = Lead Source
                data.createdTime,                              // B = Created Time
                data.fullName,                                 // C = Full Name
                data.phoneNumber,                              // D = Phone Number
                data.email                                     // E = Email
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Sheet1!A:E',  // Changed to only target columns A-E
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [mainSheetValues]
                }
            });

            // If it's a B2B lead, also add to B2B tracking sheet
            if (data.isB2B && this.b2bSheetId) {
                const b2bSheetValues = [
                    data.companyName || '',       // A = Company
                    data.fullName || '',          // B = Contact Name
                    data.phoneNumber || '',       // C = Contact Number
                    data.email || '',             // D = Contact Email
                    'Facebook Lead',              // E = Contact Via
                    'Received'                    // F = Status
                ];

                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.b2bSheetId,
                    range: 'Sheet1!A:F',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [b2bSheetValues]
                    }
                });
            }

            console.log('Successfully added to all relevant sheets');
            return true;
        } catch (error) {
            console.error('Error adding to spreadsheet(s):', error);
            throw error;
        }
    }

    async processEmails() {
        try {
            const threads = await this.gmailService.listThreads(this.sourceLabel);
            console.log(`Processing ${threads.length} Facebook lead threads`);

            for (const thread of threads) {
                try {
                    const messages = await this.gmailService.getThreadMessages(thread.id);
                    
                    for (const message of messages) {
                        const bodyText = extractPlainText(await this.gmailService.getMessageBody(message.id));
                        const leadData = this.extractLeadData(bodyText);

                        if (leadData) {
                            // Process through appropriate processor based on lead type
                            const processorResult = await (leadData.isB2B ? 
                                this.b2bProcessor.process(leadData) : 
                                this.b2cProcessor.process(leadData));

                            try {
                                await this.addToSheet(leadData);
                                await this.gmailService.moveThread(thread.id, this.sourceLabel, this.completedLabel);
                                console.log(`Successfully processed Facebook ${processorResult.type} lead for:`, leadData.fullName);
                            } catch (error) {
                                console.error('Error in sheet operation:', error.message);
                            }
                        } else {
                            console.log('Failed to extract lead data from message');
                        }
                    }
                } catch (error) {
                    console.error(`Error processing thread ${thread.id}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error in Facebook processor:', error);
            throw error;
        }
    }
}

module.exports = { FacebookProcessor };
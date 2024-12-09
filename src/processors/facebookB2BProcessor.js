const { LineNotifyService } = require('../utils/lineNotify');

class FacebookB2BProcessor {
    constructor(gmailService) {
        this.gmailService = gmailService;
        this.lineNotify = new LineNotifyService(process.env.LINE_TOKEN_B2B || process.env.LINE_TOKEN_FACEBOOK);
        this.b2bSheetId = process.env.FACEBOOK_B2B_SHEET_ID;
    }

    validateLead(lead) {
        return (
            lead.fullName &&
            lead.email &&
            lead.phoneNumber &&
            lead.companyName
        );
    }

    createLineMessage(data) {
        let message = `[Facebook B2B Lead] New business lead received.\n`;
        message += `Company: ${data.companyName}\n` +
                  `Contact: ${data.fullName}\n` +
                  `Phone: ${data.phoneNumber}\n` +
                  `Email: ${data.email}\n` +
                  `Created: ${data.createdTime}\n`;

        if (data.preferredDate) message += `Preferred Date: ${data.preferredDate}\n`;
        if (data.eventsDescription) message += `Event Details: ${data.eventsDescription}\n`;

        message += `Please call back this B2B lead and follow up.\n` +
                  `Status and outcome should be logged via ` +
                  `https://docs.google.com/spreadsheets/d/${this.b2bSheetId}/edit?usp=sharing`;

        return message;
    }

    async process(data) {
        try {
            if (!this.validateLead(data)) {
                throw new Error('Invalid B2B lead data');
            }

            const message = this.createLineMessage(data);
            await this.lineNotify.send(message);

            return {
                success: true,
                message: message,
                type: 'B2B'
            };
        } catch (error) {
            console.error('Error processing B2B lead:', error);
            throw error;
        }
    }
}

module.exports = { FacebookB2BProcessor };
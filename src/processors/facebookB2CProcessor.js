const { LineMessagingService } = require('../utils/lineMessaging');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { log } = require('../utils/logging');

class FacebookB2CProcessor {
    constructor(gmailService) {
        this.gmailService = gmailService;
        this.lineMessaging = new LineMessagingService(
            process.env.LINE_CHANNEL_ACCESS_TOKEN_B2C || process.env.LINE_CHANNEL_ACCESS_TOKEN,
            process.env.LINE_GROUP_ID_B2C || process.env.LINE_GROUP_ID,
            'B2C'
        );
    }

    validateLead(lead) {
        return (
            lead.fullName &&
            lead.email &&
            lead.phoneNumber
        );
    }

    createLineMessage(data, spamInfo) {
        let message = `[Facebook B2C Lead] New individual lead received.\n\n`;

        // Basic Information
        message += `📋 Basic Information\n`;
        message += `Name: ${data.fullName}\n`;
        message += `Phone: ${data.phoneNumber}\n`;
        message += `Email: ${data.email}\n`;
        message += `Created: ${data.createdTime}\n\n`;

        // Visit Details
        message += `🎯 Visit Details\n`;
        if (data.previousLengolfExperience) message += `Previous Experience: ${data.previousLengolfExperience}\n`;
        if (data.groupSize) message += `Group Size: ${data.groupSize}\n`;
        if (data.preferredTime) message += `Preferred Time: ${data.preferredTime}\n`;
        if (data.plannedVisit) message += `Planned Visit: ${data.plannedVisit}\n`;

        // Form-specific fields for new form
        if (data.visitPurpose) message += `Visit Purpose: ${data.visitPurpose}\n`;
        if (data.preferredLocation) message += `Preferred Location: ${data.preferredLocation}\n`;
        if (data.golfExperience) message += `Golf Experience: ${data.golfExperience}\n`;
        if (data.foodPreferences) message += `Food Preferences: ${data.foodPreferences}\n`;
        if (data.specialOccasion) message += `Special Occasion: ${data.specialOccasion}\n`;

        // Additional Information
        if (data.additionalInquiries) {
            message += `\n❓ Additional Inquiries\n`;
            message += `${data.additionalInquiries}\n`;
        }

        message += `\n📝 Please call back this lead and follow up.\n`;
        message += `Status and outcome should be logged via `;
        message += `https://docs.google.com/spreadsheets/d/${process.env.FACEBOOK_SHEET_ID}/edit?usp=sharing`;

        return message;
    }

    async sendNotification(data, processedLead) {
        try {
            const message = this.createLineMessage(data, processedLead);
            await this.lineMessaging.send(message);
            log('INFO', 'Sent B2C LINE notification', { 
                fullName: data.fullName,
                groupSize: data.groupSize
            });
        } catch (error) {
            log('ERROR', 'Error sending B2C LINE notification', {
                error: error.message,
                fullName: data.fullName
            });
            throw error;
        }
    }

    async process(data, skipNotification = false) {
        try {
            if (!this.validateLead(data)) {
                log('ERROR', 'Invalid B2C lead data', { 
                    fullName: data.fullName,
                    hasEmail: !!data.email,
                    hasPhone: !!data.phoneNumber
                });
                throw new Error('Invalid B2C lead data');
            }

            const spamInfo = await calculateSpamScore(data);
            
            // Only send notification if not skipping and not spam
            if (!skipNotification && !spamInfo.isLikelySpam) {
                await this.sendNotification(data, spamInfo);
            }

            return {
                success: true,
                type: 'B2C',
                isLikelySpam: spamInfo.isLikelySpam,
                spamScore: spamInfo.score,
                spamReasons: spamInfo.reasons,
                detectionType: spamInfo.detectionType || 'rule-based',
                previousExperience: data.previousLengolfExperience,
                groupSize: data.groupSize,
                preferredTime: data.preferredTime
            };
        } catch (error) {
            log('ERROR', 'Error processing B2C lead', {
                error: error.message,
                fullName: data.fullName
            });
            throw error;
        }
    }
}

module.exports = { FacebookB2CProcessor };
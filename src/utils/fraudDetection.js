const EMAIL_BLACKLIST_DOMAINS = [
    'tempmail.com',
    'temp-mail.org',
    'guerrillamail.com'
];

const SUSPICIOUS_EMAIL_PATTERNS = [
    /(.)\1{8,}/,  // Same character repeated 8+ times
    /^(test|spam|temp|fake)@/i,  // Only flag obvious test emails
    /[<>'"()\\,\[\]{}]/,  // Dangerous characters in email
    /gmil\.com/i,  // Common typo of gmail.com
    /yandex/i,  // Any email containing yandex
    /^[^@]*@[^@]*\.com[a-zA-Z0-9]/i,  // Extra characters after .com
    /^[^@]*@[^@]*\.co\.th[a-zA-Z0-9]/i,  // Extra characters after .co.th
    /[A-Z]{5,}/  // Long uppercase sequences (common in spam)
];

const SUSPICIOUS_NAME_PATTERNS = [
    /[A-Za-z0-9]{40,}/,  // Excessively long sequences of letters/numbers
    /^test/i,            // Names starting with "test"
    /(?<!^Mr|^Mrs|^Ms|^Dr|^Prof)\.[^@]/i,  // Special characters but allow periods in common titles
    /[!@#$%^&*()?":{}|<>]/  // Other special characters (removed comma and period)
];

const { llmSpamDetector } = require('./llmSpamDetection');
const { log } = require('./logging');

function isSpamEmail(email) {
    if (!email) return false;
    
    // Debug logging for specific email
    if (email === 'e23pwo@gmail.com') {
        console.log('Checking e23pwo@gmail.com...');
    }
    
    // Check blacklisted domains
    const domain = email.split('@')[1]?.toLowerCase();
    if (EMAIL_BLACKLIST_DOMAINS.some(blacklisted => domain?.includes(blacklisted))) {
        console.log('Email flagged due to blacklisted domain:', email);
        return true;
    }

    // Check for suspicious patterns
    for (const pattern of SUSPICIOUS_EMAIL_PATTERNS) {
        if (pattern.test(email)) {
            if (email === 'e23pwo@gmail.com') {
                console.log('e23pwo@gmail.com flagged by pattern:', pattern);
            }
            console.log('Email flagged due to pattern:', pattern, email);
            return true;
        }
    }
    
    if (email === 'e23pwo@gmail.com') {
        console.log('e23pwo@gmail.com passed all checks');
    }
    return false;
}

function isSpamName(name) {
    if (!name) return false;
    
    // Check for suspicious patterns
    for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
        if (pattern.test(name)) {
            console.log('Name flagged due to pattern:', pattern, name);
            return true;
        }
    }
    return false;
}

function detectPhoneSpam(phone) {
    if (!phone) return false;
    
    // Remove all non-numeric characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check for suspicious patterns
    const isSpam = (
        cleanPhone.length < 8 || // Too short
        cleanPhone.length > 15 || // Too long
        /^(.)\1{5,}/.test(cleanPhone) || // Same digit repeated 6+ times
        /^(12345|11111|00000)/.test(cleanPhone) // Sequential or repeated numbers
    );

    if (isSpam) {
        console.log('Phone flagged as spam:', phone);
    }
    return isSpam;
}

async function calculateSpamScore(lead) {
    let score = 0;
    let reasons = [];

    // Try to use LLM-based detection first
    try {
        const llmResult = await llmSpamDetector.detectSpam(lead);
        
        if (llmResult) {
            // LLM detection worked, use its result
            log('INFO', 'Using LLM for spam detection', { 
                leadName: lead.fullName,
                score: llmResult.spamScore,
                isSpam: llmResult.isLikelySpam
            });
            
            return {
                score: llmResult.spamScore,
                reasons: llmResult.spamReasons,
                isLikelySpam: llmResult.isLikelySpam,
                llmAnalysis: llmResult.llmAnalysis,
                detectionType: 'llm'
            };
        }
    } catch (error) {
        log('WARNING', 'Error in LLM spam detection, falling back to rule-based', { 
            error: error.message 
        });
        // Fall back to rule-based detection on error
    }
    
    // Email checks
    if (isSpamEmail(lead.email)) {
        score += 3;
        reasons.push('Suspicious email pattern');
    }

    // Name checks
    if (isSpamName(lead.fullName)) {
        score += 2;
        reasons.push('Suspicious name pattern');
    }

    // Phone checks
    if (detectPhoneSpam(lead.phoneNumber || lead.phone)) {
        score += 2;
        reasons.push('Suspicious phone pattern');
    }

    // Time-based checks (if created within suspicious hours)
    const leadTime = new Date(lead.createdTime);
    const hour = leadTime.getHours();
    if (hour >= 0 && hour <= 4) { // Between midnight and 4 AM
        score += 1;
        reasons.push('Created during suspicious hours');
    }

    console.log('Rule-based detection results:', { score, reasons, isLikelySpam: score >= 3 });

    // Check for suspicious patterns in Thai names with random characters
    // This helps catch the examples provided in the request
    if (lead.fullName && typeof lead.fullName === 'string') {
        // Check for Thai names followed by random Latin characters
        const thaiNameWithRandomChars = /^[\u0E00-\u0E7F\s]+([\W\da-zA-Z]{4,})/;
        if (thaiNameWithRandomChars.test(lead.fullName)) {
            score += 3;
            reasons.push('Thai name with random character suffix');
        }
        
        // Check for excessive mixed character types (Thai + Latin + numbers + symbols)
        let charTypeCounts = {
            thai: 0,
            latin: 0,
            number: 0,
            symbol: 0
        };
        
        for (const char of lead.fullName) {
            if (/[\u0E00-\u0E7F]/.test(char)) charTypeCounts.thai++;
            else if (/[a-zA-Z]/.test(char)) charTypeCounts.latin++;
            else if (/\d/.test(char)) charTypeCounts.number++;
            else if (/\W/.test(char)) charTypeCounts.symbol++;
        }
        
        const hasExcessiveMixing = Object.values(charTypeCounts).filter(count => count > 0).length >= 3;
        if (hasExcessiveMixing && charTypeCounts.thai > 0) {
            score += 2;
            reasons.push('Excessive character type mixing in name');
        }
    }

    return {
        score,
        reasons,
        isLikelySpam: score >= 3,
        detectionType: 'rule-based'
    };
}

module.exports = {
    isSpamEmail,
    isSpamName,
    detectPhoneSpam,
    calculateSpamScore
}; 
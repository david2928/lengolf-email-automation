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

function calculateSpamScore(lead) {
    let score = 0;
    let reasons = [];

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
    if (detectPhoneSpam(lead.phoneNumber)) {
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

    // Multiple submissions check (requires external data)
    // This would be implemented when we have access to historical data

    return {
        score,
        reasons,
        isLikelySpam: score >= 3
    };
}

module.exports = {
    isSpamEmail,
    isSpamName,
    detectPhoneSpam,
    calculateSpamScore
}; 
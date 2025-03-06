const { log } = require('./logging');

let VertexAI;
try {
    VertexAI = require('@google-cloud/vertexai').VertexAI;
} catch (error) {
    log('WARNING', 'Failed to load @google-cloud/vertexai library', { 
        error: error.message 
    });
}

// Initialize Vertex AI with your Google Cloud project and location
const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL_NAME = 'gemini-1.0-pro';

// Spam detection prompt template
const SPAM_DETECTION_PROMPT = `
You are an AI tasked with identifying spam/bot submissions in a form for golf experiences in Thailand.
Analyze the following details and determine if it's likely a spam/bot submission.
Consider these signals of spam:
1. Nonsensical characters appended to real names
2. Random alphanumeric strings in the name field
3. Clearly fake/temporary email addresses
4. Non-Thai phone numbers that don't match standard formats
5. Excessive repetition of characters or patterns
6. Inconsistencies between fields (e.g., Thai name with non-Thai phone format)

Return a JSON response with:
1. isSpam: boolean
2. confidence: number (0-1)
3. reasons: array of strings explaining why
4. analysis: brief explanation of your reasoning

User Information:
Name: {fullName}
Email: {email}
Phone: {phoneNumber}
Additional Fields: {additionalFields}
`;

class LLMSpamDetector {
    constructor() {
        // Check if VertexAI is available
        if (!VertexAI) {
            this.enabled = false;
            this.isInitialized = false;
            log('WARNING', 'LLM Spam Detection is disabled due to missing VertexAI library');
            return;
        }
        
        // Check if LLM spam detection is enabled
        this.enabled = process.env.ENABLE_LLM_SPAM_DETECTION === 'true';
        
        if (!this.enabled) {
            this.isInitialized = false;
            log('INFO', 'LLM Spam Detection is disabled via environment variable');
            return;
        }
        
        // Make sure PROJECT_ID is defined
        if (!PROJECT_ID) {
            this.isInitialized = false;
            log('WARNING', 'LLM Spam Detection is disabled due to missing PROJECT_ID');
            return;
        }
        
        try {
            // Initialize the Vertex AI client
            this.vertexai = new VertexAI({ project: PROJECT_ID, location: LOCATION });
            this.generativeModel = this.vertexai.preview.getGenerativeModel({
                model: MODEL_NAME,
                generationConfig: {
                    temperature: 0.1, // Keep temperature low for more consistent results
                    maxOutputTokens: 1024,
                }
            });
            this.isInitialized = true;
            log('INFO', 'LLM Spam Detector initialized successfully');
        } catch (error) {
            this.isInitialized = false;
            log('ERROR', 'Failed to initialize LLM Spam Detector', { error: error.message });
        }
    }

    async detectSpam(leadData) {
        if (!this.enabled || !this.isInitialized) {
            if (!this.enabled) {
                log('DEBUG', 'LLM Spam Detection is disabled, falling back to rule-based detection');
            } else {
                log('WARNING', 'LLM Spam Detector not initialized, falling back to rule-based detection');
            }
            return null;
        }

        try {
            // Create the prompt with the lead data
            const additionalFields = {};
            
            // Add B2B specific fields if present
            if (leadData.companyName) additionalFields.companyName = leadData.companyName;
            if (leadData.eventType) additionalFields.eventType = leadData.eventType;
            
            // Add B2C specific fields if present
            if (leadData.previousLengolfExperience) 
                additionalFields.previousExperience = leadData.previousLengolfExperience;
            if (leadData.groupSize) additionalFields.groupSize = leadData.groupSize;
            
            const prompt = SPAM_DETECTION_PROMPT
                .replace('{fullName}', leadData.fullName || 'N/A')
                .replace('{email}', leadData.email || 'N/A')
                .replace('{phoneNumber}', leadData.phone || leadData.phoneNumber || 'N/A')
                .replace('{additionalFields}', JSON.stringify(additionalFields));

            // Call the Gemini model
            const result = await this.generativeModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const response = result.response;
            const textResponse = response.candidates[0].content.parts[0].text;

            // Extract JSON from Markdown code blocks if present
            let jsonStr = textResponse;
            const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
                jsonStr = jsonMatch[1].trim();
            }
            
            // Parse the JSON response
            try {
                // Try to parse as JSON first
                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(jsonStr);
                } catch (initialParseError) {
                    // If initial parsing fails, try to extract JSON from a non-code-block format
                    // This handles cases where the LLM formats the response as markdown without code blocks
                    log('DEBUG', 'Initial JSON parsing failed, attempting to extract JSON manually', { 
                        error: initialParseError.message
                    });
                    
                    // Extract values using regex patterns
                    const isSpamMatch = textResponse.match(/isSpam["\s:]*\s*([Tt]rue|[Ff]alse|\d+)/);
                    const confidenceMatch = textResponse.match(/confidence["\s:]*\s*(0\.\d+|\d+)/);
                    
                    if (isSpamMatch || confidenceMatch) {
                        // Construct a JSON object manually
                        jsonResponse = {
                            isSpam: isSpamMatch ? 
                                isSpamMatch[1].toLowerCase() === 'true' || 
                                parseFloat(isSpamMatch[1]) > 0.5 : false,
                            confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
                            reasons: [],
                            analysis: textResponse
                        };
                        
                        // Try to extract reasons if they exist
                        const reasonsSection = textResponse.match(/reasons[\s\S]*?(?=analysis|$)/i);
                        if (reasonsSection) {
                            const reasonsList = reasonsSection[0].match(/[0-9]+\.\s*(.*?)(?=\n|$)/g);
                            if (reasonsList) {
                                jsonResponse.reasons = reasonsList.map(r => r.replace(/^[0-9]+\.\s*/, '').trim());
                            }
                        }
                    } else {
                        // If we can't extract key information, re-throw the original error
                        throw initialParseError;
                    }
                }
                
                log('INFO', 'LLM spam detection result', { 
                    isSpam: jsonResponse.isSpam,
                    confidence: jsonResponse.confidence,
                    leadName: leadData.fullName
                });

                return {
                    isLikelySpam: jsonResponse.isSpam,
                    spamScore: Math.round(jsonResponse.confidence * 10), // Convert 0-1 to 0-10 scale
                    spamReasons: jsonResponse.reasons || [],
                    llmAnalysis: jsonResponse.analysis || ''
                };
            } catch (parseError) {
                log('ERROR', 'Failed to parse LLM response', { 
                    error: parseError.message,
                    response: textResponse
                });
                return null;
            }
        } catch (error) {
            log('ERROR', 'LLM spam detection failed', { 
                error: error.message, 
                leadName: leadData.fullName 
            });
            return null;
        }
    }
}

// Export singleton instance
const llmSpamDetector = new LLMSpamDetector();

module.exports = { llmSpamDetector }; 
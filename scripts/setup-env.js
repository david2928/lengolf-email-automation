const fs = require('fs');
const path = require('path');

// Create YAML content directly from environment variables
function createYamlContent() {
    const envVars = {
        PROJECT_ID: process.env.PROJECT_ID,
        REGION: process.env.REGION,
        FACEBOOK_SHEET_ID: process.env.FACEBOOK_SHEET_ID,
        FACEBOOK_B2B_SHEET_ID: process.env.FACEBOOK_B2B_SHEET_ID,
        LINE_TOKEN_CLASSPASS: process.env.LINE_TOKEN_CLASSPASS,
        LINE_TOKEN_WEBRESOS: process.env.LINE_TOKEN_WEBRESOS,
        LINE_TOKEN_FACEBOOK: process.env.LINE_TOKEN_FACEBOOK,
        LINE_TOKEN_B2B: process.env.LINE_TOKEN_B2B,
        LINE_TOKEN_B2C: process.env.LINE_TOKEN_B2C,
        LABEL_CLASSPASS: process.env.LABEL_CLASSPASS,
        LABEL_WEB: process.env.LABEL_WEB,
        LABEL_RESOS: process.env.LABEL_RESOS,
        LABEL_FACEBOOK: process.env.LABEL_FACEBOOK,
        LABEL_COMPLETED: process.env.LABEL_COMPLETED
    };

    const yamlLines = Object.entries(envVars).map(([key, value]) => {
        // Skip undefined values
        if (value === undefined) return null;
        // Add quotes if value contains spaces
        const yamlValue = value.includes(' ') ? `"${value}"` : value;
        return `${key}: ${yamlValue}`;
    }).filter(Boolean); // Remove null entries

    return yamlLines.join('\n');
}

try {
    // For local development, try to read from .env if it exists
    if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
        const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
        const yamlContent = envContent.split('\n')
            .map(line => {
                // Skip empty lines or comments
                if (!line || line.startsWith('#')) return line;
                
                const match = line.match(/^([^=]+)=(.*)$/);
                if (!match) return line;
                
                const [_, key, value] = match;
                // Add quotes if value contains spaces
                const yamlValue = value.includes(' ') ? `"${value}"` : value;
                return `${key}: ${yamlValue}`;
            }).join('\n');

        fs.writeFileSync(path.join(__dirname, '..', 'env.yaml'), yamlContent);
    } else {
        // In CI environment, create from environment variables
        const yamlContent = createYamlContent();
        fs.writeFileSync(path.join(__dirname, '..', 'env.yaml'), yamlContent);
    }

    console.log('Successfully created env.yaml');
} catch (error) {
    console.error('Error creating env.yaml:', error);
    process.exit(1);
}
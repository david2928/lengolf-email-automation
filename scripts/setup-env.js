const fs = require('fs');
const path = require('path');

// Function to convert .env to env.yaml
function envToYaml(envContent) {
    const lines = envContent.split('\n');
    const yamlLines = lines.map(line => {
        // Skip empty lines or comments
        if (!line || line.startsWith('#')) return line;
        
        const match = line.match(/^([^=]+)=(.*)$/);
        if (!match) return line;
        
        const [_, key, value] = match;
        // Add quotes if value contains spaces
        const yamlValue = value.includes(' ') ? `"${value}"` : value;
        return `${key}: ${yamlValue}`;
    });
    
    return yamlLines.join('\n');
}

// Read .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Convert and write to env.yaml
const yamlContent = envToYaml(envContent);
const yamlPath = path.join(__dirname, '..', 'env.yaml');
fs.writeFileSync(yamlPath, yamlContent);

console.log('Successfully created env.yaml from .env');
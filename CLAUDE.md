# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Running the Application
```bash
node src/app.js                               # Start the main application
```

### Testing Scripts
```bash
node src/scripts/testSpamDetection.js         # Test spam detection functionality
node src/scripts/testB2BNotification.js       # Test B2B LINE notifications
node src/scripts/testB2CLeads.js              # Test B2C lead processing
node src/scripts/testLineMessaging.js         # Test LINE messaging integration
node src/scripts/testLlmSpamDetector.js       # Test LLM-based spam detection
./scripts/test-spam-detection.sh              # Bash script for spam detection testing
```

### Data Management
```bash
node src/scripts/loadHistoricalLeads.js       # One-time historical data import
node src/scripts/processRecentLeads.js        # Process recent leads manually
node src/scripts/exportLeadsToCSV.js          # Export leads data to CSV
node src/scripts/extractAllLeads.js           # Extract all leads from system
node src/scripts/loadLeadsToSupabase.js       # Load leads to Supabase database
```

### Meta/Facebook Token Management
```bash
node src/scripts/refreshMetaToken.js          # Manually refresh Meta access token
node src/scripts/generateToken.js             # Generate new Meta tokens
```

### Utilities
```bash
node src/scripts/checkFormFields.js           # Check form field configurations
```

## Architecture Overview

### Core Application (src/app.js)
- Express server with health check endpoint
- Continuous processing loop (15-minute intervals)
- Automatic retry logic with exponential backoff
- Meta token validation and refresh on startup
- Graceful shutdown handling

### Multi-Source Lead Processing System
The application processes leads from three main sources through dedicated processors:

1. **Facebook Leads** (`facebookProcessor.js`)
   - Delegates to specialized B2B/B2C processors
   - Integrates with Meta Lead Ads API
   - Handles form ID-based routing (B2B: 562422893450533/905376497889703, B2C: 625669719834512/1067700894958557)

2. **ClassPass Bookings** (`classPassProcessor.js`)
   - Processes booking confirmations from Gmail
   - Extracts customer and booking details

3. **Web Reservations** (`webResosProcessor.js`)
   - Handles web-based reservation emails
   - Integrates with Google Sheets for tracking

### Services Layer
- **GmailService** (`gmailService.js`): Gmail API integration for email processing
- **MetaLeadService** (`metaLeadService.js`): Meta Lead Ads API integration
- **LineMessagingService** (`lineMessagingService.js`): LINE Bot API for notifications

### Spam Detection System
Dual-layer spam detection approach:

1. **LLM-Based Detection** (Primary)
   - Uses Google Vertex AI Gemini model (`gemini-2.0-flash-001`)
   - Analyzes lead data for spam indicators
   - Requires `ENABLE_LLM_SPAM_DETECTION=true` and Google Cloud setup

2. **Rule-Based Detection** (Fallback)
   - Pattern matching for suspicious emails, names, phone numbers
   - Configurable spam scoring system (threshold: ≥3)

### Data Storage
- **Supabase**: Primary database for lead storage and deduplication
- **Google Sheets**: Legacy integration for lead tracking
- **File System**: Historical data and metadata storage

### Notification System
- **LINE Messaging API**: Replaces deprecated LINE Notify
- Group-specific routing based on lead source:
  - B2B leads: `LINE_GROUP_ID_B2B`
  - B2C leads: `LINE_GROUP_ID_B2C` 
  - ClassPass: `LINE_GROUP_ID_CLASSPASS`
  - Web reservations: `LINE_GROUP_ID_WEBRESOS`

### Meta Token Management
Automated Meta access token lifecycle management:
- Token validation on startup
- Long-lived token generation (60-day validity)
- Automatic refresh before expiration
- GitHub Actions workflow for scheduled refresh
- Environment file updates

## Key Environment Variables

### Required for Core Functionality
- `META_ACCESS_TOKEN`: Facebook access token for lead retrieval
- `META_PAGE_ID`: Facebook page ID
- `META_B2B_FORM_ID` / `META_B2C_FORM_ID`: Form IDs for lead routing
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Bot API token
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: Supabase connection

### Optional Features
- `ENABLE_LLM_SPAM_DETECTION=true`: Enable AI-powered spam detection
- `GOOGLE_CLOUD_PROJECT` / `VERTEX_LOCATION`: For Vertex AI spam detection
- `META_APP_ID` / `META_APP_SECRET`: For automated token management

## Processing Flow
1. Application starts with Meta token validation
2. Gmail authentication and service initialization
3. Parallel processing of all lead sources every 15 minutes
4. Spam detection (LLM + rule-based fallback)
5. Deduplication via Supabase lookup
6. Google Sheets integration for tracking
7. LINE notifications to appropriate groups
8. Error handling with retry logic and failure tracking
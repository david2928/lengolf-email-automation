p# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Running the Application
```bash
node src/app.js                               # Start the main application
```

### Testing Scripts
```bash
node src/scripts/testBookingAutomation.js     # Dry-run test for booking automation (recommended first test)
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
   - Processes booking confirmations and cancellations from Gmail
   - Automatically creates confirmed bookings in lengolf-forms database
   - Matches existing customers using phone/email/fuzzy name matching
   - Auto-assigns bays based on availability and party size
   - Tracks ClassPass reservation keys for cancellation matching
   - Sends formatted LINE notifications with booking details
   - Prevents duplicate processing using Gmail message ID tracking

3. **ResOS Reservations** (`webResosProcessor.js`)
   - Handles ResOS reservation emails (previously Web Leads)
   - Automatically creates bookings with staff confirmation note
   - Supports both 12-hour and 24-hour time formats
   - Processes cancellations by matching customer details and time
   - Sends "no slots available" notifications when bays are full
   - Calculates duration from start/end times

### Services Layer

**Email & Notification Services:**
- **GmailService** (`gmailService.js`): Gmail API integration for email processing
- **MetaLeadService** (`metaLeadService.js`): Meta Lead Ads API integration
- **LineMessagingService** (`lineMessagingService.js`): LINE Bot API for notifications

**Booking Automation Services:**
- **BookingService** (`services/bookingService.js`): Manages booking CRUD operations
  - Bay availability checking with time overlap detection
  - Auto-assignment based on party size (Bays 1-3 for up to 5 people, Bay 4 for up to 2)
  - Booking ID generation (format: BK20251201001)
  - Supports both 12-hour and 24-hour time formats
  - Finds bookings by reservation key or customer details

- **CustomerService** (`services/customerService.js`): Customer matching and creation
  - Phone normalization (last 9 digits for Thailand numbers)
  - Priority matching: Phone > Email > Fuzzy Name
  - Uses PostgreSQL similarity function for fuzzy name matching (>90% threshold)
  - Auto-generates customer codes (CUS-001, CUS-002, etc.)

- **EmailTrackingService** (`services/emailTrackingService.js`): Duplicate prevention
  - Tracks processed Gmail message IDs in `processed_emails` table
  - Records action taken (booking_created, booking_cancelled, no_slots, error)
  - Provides processing history and statistics

- **LineNotificationService** (`services/lineNotificationService.js`): Formats LINE messages
  - Booking created: Plain text format matching lengolf-forms style
  - Booking cancelled: Emoji format with customer details
  - No slots available: Current format with warning note appended

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
- **Supabase**: Primary database (shared with lengolf-forms project)
  - `leads` table: Facebook lead storage and deduplication
  - `customers` table: Customer records with normalized phone numbers
  - `bookings` table: Booking records with new fields:
    - `customer_contacted_via`: Channel through which booking was created (ClassPass, ResOS, etc.)
    - `reservation_key`: External reservation identifier for cancellation matching
  - `processed_emails` table: Tracks processed Gmail messages to prevent duplicates
    - Gmail message IDs with unique constraint
    - Action taken (booking_created, booking_cancelled, no_slots, error)
    - Error messages and email metadata
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
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Supabase connection (uses service role key for booking automation)

### Optional Features
- `ENABLE_LLM_SPAM_DETECTION=true`: Enable AI-powered spam detection
- `GOOGLE_CLOUD_PROJECT` / `VERTEX_LOCATION`: For Vertex AI spam detection
- `META_APP_ID` / `META_APP_SECRET`: For automated token management

## Processing Flow

### Facebook Leads Processing
1. Application starts with Meta token validation
2. Gmail authentication and service initialization
3. Parallel processing of all lead sources every 15 minutes
4. Spam detection (LLM + rule-based fallback)
5. Deduplication via Supabase lookup
6. Google Sheets integration for tracking
7. LINE notifications to appropriate groups
8. Error handling with retry logic and failure tracking

### ClassPass Booking Automation
1. Fetch unprocessed ClassPass emails from Gmail
2. Check if email already processed (Gmail message ID lookup in `processed_emails`)
3. Extract booking details (date, time, customer name, email, phone, reservation key)
4. Detect if booking confirmation or cancellation
5. **For Confirmations:**
   - Match or create customer (allow fuzzy name matching)
   - Convert time to 24-hour format
   - Check bay availability for date/time/party size
   - If available: Create confirmed booking and send LINE notification
   - If unavailable: Send "no slots" LINE notification
6. **For Cancellations:**
   - Find booking by reservation key or customer details + time
   - Cancel booking in database
   - Send cancellation LINE notification
7. Track email as processed in `processed_emails` table
8. Move Gmail thread to "completed" label

### ResOS Booking Automation
1. Fetch unprocessed ResOS emails from Gmail
2. Check if email already processed (Gmail message ID lookup)
3. Extract booking details (supports both 12-hour and 24-hour time formats)
4. Calculate duration from start/end times
5. Detect if booking confirmation or cancellation
6. **For Confirmations:**
   - Match or create customer (no fuzzy matching since phone provided)
   - Check bay availability
   - If available: Create booking with "Please call customer to confirm" note
   - If unavailable: Send "no slots" notification with manual handling note
7. **For Cancellations:**
   - Find booking by customer details + time + ResOS source
   - Cancel booking in database
   - Send cancellation LINE notification
8. Track email as processed
9. Move Gmail thread to "completed" label

### Duplicate Prevention Strategy
- Gmail message IDs stored in `processed_emails` with unique constraint
- Email processed check happens before any other operations
- If duplicate detected, skip processing and move thread to completed
- Prevents duplicate notifications and bookings
# LENGOLF Email Automation

Automated email processing and lead management system for LENGOLF.

## Features

- Multi-source lead processing:
  - Facebook B2B and B2C leads
  - ClassPass bookings
  - Web reservations
- Automated email responses
- Google Sheets integration for lead tracking
- Separated B2B and B2C lead processing

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## First-Time Setup

1. Run historical data import (one-time operation):
```bash
node src/scripts/loadHistoricalLeads.js
```

This creates the initial data structure:
```json
{
  "b2b": {
    "leads": [],
    "lastProcessed": ""
  },
  "b2c": {
    "leads": [],
    "lastProcessed": ""
  }
}
```

## Running the Application

Start the continuous processing:
```bash
node src/app.js
```

The application will:
- Process new leads every 15 minutes
- Track B2B and B2C leads separately
- Auto-retry on failures (max 5 consecutive failures)

## Architecture

- `src/app.js`: Main application entry point
- `src/processors/`: Lead processing logic
  - `facebookProcessor.js`: Facebook lead processing
  - `classPassProcessor.js`: ClassPass booking processing
  - `webResosProcessor.js`: Web reservation processing
- `src/services/`: External service integrations
- `src/utils/`: Helper utilities
- `data/`: Data storage

## Error Handling

- Automatic retries for transient failures
- Separate error handling for each lead source
- Detailed error logging
- Email notifications for critical failures

## Spam Detection

The application uses a multi-layered approach to detect spam/bot submissions:

### LLM-Based Detection (New)

The system now uses Google Vertex AI's Gemini model to intelligently identify spam and bot submissions:

- Detects non-sensical character sequences appended to names
- Identifies random alphanumeric strings in names
- Recognizes fake or temporary email addresses
- Flags inconsistencies between fields (e.g., Thai name with non-Thai phone format)

To configure:
```
# In .env file
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
VERTEX_LOCATION=us-central1
ENABLE_LLM_SPAM_DETECTION=true
```

Requirements:
- Must have Google Cloud project with Vertex AI API enabled
- Default service account must have access to Vertex AI
- Gemini API must be available in your region

### Rule-Based Detection (Fallback)

If LLM detection is disabled or fails, the system falls back to rule-based detection using regex patterns:

- Email blacklist domains
- Suspicious patterns in names, emails, and phone numbers
- Time-based heuristics (e.g., submissions during unusual hours)
- Thai-specific patterns (Thai characters with random Latin character suffixes)

Any lead with a spam score ≥ 3 is marked as spam and skipped for LINE notification.

## Spam Detection with AI

This project integrates Google's Vertex AI service for enhanced spam detection in the LENGOLF Email Automation system. The system uses a combination of rule-based and AI-powered detection methods to identify spam leads.

### Setting up Vertex AI

1. Enable the Vertex AI API:
   ```
   gcloud services enable aiplatform.googleapis.com
   ```

2. Create a service account for the application:
   ```
   gcloud iam service-accounts create email-processor-sa --display-name="Email Processor Service Account"
   ```

3. Grant the service account the Vertex AI User role:
   ```
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:email-processor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/aiplatform.user"
   ```

4. Generate a service account key:
   ```
   gcloud iam service-accounts keys create credentials.json --iam-account=email-processor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

5. Set the following environment variables in your `.env` file:
   ```
   VERTEX_LOCATION=us-central1
   ENABLE_LLM_SPAM_DETECTION=true
   GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
   ```

### For Cloud Run Deployment

1. Ensure the Cloud Run service account has access to Vertex AI:
   ```
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/aiplatform.user"
   ```

2. Update the Cloud Build configuration to include the necessary environment variables.

### Testing Spam Detection

You can test the spam detection functionality using the provided test script:

```
node src/scripts/testSpamDetection.js
```

This script tests both rule-based and LLM-based detection methods on sample leads, providing detailed output about the detection results.

The spam detection system uses two complementary approaches:

1. **Rule-Based Detection**: Uses pattern matching to identify suspicious emails, names, and phone numbers.
2. **LLM-Based Detection**: Uses Google's Vertex AI to analyze lead data and provide a more nuanced assessment.

The system will automatically fall back to rule-based detection if LLM detection is unavailable or disabled.

## LINE Messaging API Integration

The application uses LINE Messaging API for sending notifications to LINE groups. This replaces the deprecated LINE Notify API.

### Setting up LINE Messaging API

1. Create a new channel in the [LINE Developers Console](https://developers.line.biz/console/)
2. Note your Channel ID, Channel Secret, and Channel Access Token
3. Add your bot to the LINE groups where you want to send notifications
4. Get the group IDs by implementing a temporary webhook or using the LINE Bot API

### Environment Variables

Configure the following environment variables:

```
# LINE Messaging API configuration
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_CHANNEL_SECRET=your_channel_secret_here

# Group IDs for different notification types
# You only need ONE channel access token for ALL groups
LINE_GROUP_ID=your_main_group_id_here  # Default fallback group
LINE_GROUP_ID_B2B=your_b2b_group_id
LINE_GROUP_ID_B2C=your_b2c_group_id
LINE_GROUP_ID_CLASSPASS=your_classpass_group_id
LINE_GROUP_ID_WEBRESOS=your_webresos_group_id
```

Note: You only need a single channel access token for all groups. The system will use the appropriate group ID for each notification type while using the same bot/channel.

### Features

- Sends plain text messages to LINE groups
- Can send rich messages with buttons and formatting
- Different lead sources can send to different LINE groups
- Error handling and retry logic built-in
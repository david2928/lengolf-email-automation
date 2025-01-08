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
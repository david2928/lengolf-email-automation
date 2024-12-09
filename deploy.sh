#!/bin/bash

# Set variables
PROJECT_ID="lengolf-email-automation"
REGION="asia-southeast1"
SERVICE_NAME="email-processor"

# Build and deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "PROJECT_ID=$PROJECT_ID,REGION=$REGION" \
  --service-account "email-processor-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --timeout 540s

# Get the deployed service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"

# Create or update Cloud Scheduler job
gcloud scheduler jobs create http process-emails \
  --schedule="*/10 * * * *" \
  --http-method=POST \
  --uri="$SERVICE_URL/process" \
  --oidc-service-account-email="scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --location=$REGION \
  --project=$PROJECT_ID \
  || gcloud scheduler jobs update http process-emails \
     --schedule="*/10 * * * *" \
     --http-method=POST \
     --uri="$SERVICE_URL/process" \
     --oidc-service-account-email="scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --location=$REGION \
     --project=$PROJECT_ID
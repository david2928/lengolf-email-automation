#!/bin/bash

# Set environment variables if not already set
export NODE_ENV=development

# Check if the right directories exist
if [ ! -d "src" ]; then
  echo "Error: This script must be run from the project root directory."
  exit 1
fi

echo "Running Facebook lead spam detection test..."
echo "============================================"
echo ""

# Run the test script
node src/scripts/testRecentLeads.js

echo ""
echo "Test completed." 
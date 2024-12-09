const fs = require('fs').promises;
const path = require('path');

// Folder path where your files are located
const folderPath = 'C:/vs_code/lengolf_booking';

// Files to extract from the specified folder structure
const filesToExtract = [
  'config/googleApiConfig.js',
  'config/redisConfig.js',
  'config/index.js',
  'controllers/authController.js',
  'controllers/bookingController.js',
  'controllers/customerController.js',
  'routes/api/authRoutes.js',
  'routes/api/bookingRoutes.js',
  'routes/api/customerRoutes.js',
  'routes/index.js',
  'services/cache/redisService.js',
  'services/google/calendarService.js',
  'services/google/sheetsService.js',
  'services/notifications/lineNotifyService.js',
  'services/bookingService.js',
  'services/lineService.js',  
  'services/customerService.js',
  'middlewares/authMiddleware.js',
  'middlewares/errorHandler.js',
  'middlewares/validationMiddleware.js',
  'utils/logger.js',
  'utils/scheduler.js',
  'public/css/styles.css',
  'public/js/main.js',
  'public/index.html',
  'index.js'
];

// Output file where the combined content will be saved
const outputFilePath = path.join(folderPath, 'all_files_combined.txt');

// Function to extract content asynchronously
async function extractFiles() {
  let combinedContent = '';

  for (const relativeFilePath of filesToExtract) {
    const fullPath = path.join(folderPath, relativeFilePath);
    try {
      // Read file content asynchronously
      const content = await fs.readFile(fullPath, 'utf8');
      // Append the file name and content to the combined content string
      combinedContent += `\n\n==== ${relativeFilePath} ====\n\n${content}\n\n`;
    } catch (err) {
      console.log(`Error reading file ${relativeFilePath}: ${err.message}`);
    }
  }

  try {
    // Write the combined content to the output file
    await fs.writeFile(outputFilePath, combinedContent);
    console.log(`Extracted files content saved to ${outputFilePath}`);
  } catch (err) {
    console.log(`Error writing to output file: ${err.message}`);
  }
}

// Run the extraction function
extractFiles();

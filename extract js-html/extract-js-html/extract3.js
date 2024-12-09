const fs = require('fs').promises;
const path = require('path');

// Folder path where your files are located
const folderPath = 'C:/vs_code/ocp-bank-poc';

// Output file where the combined content will be saved
const outputFilePath = `${folderPath}.txt`;

// Function to recursively get all .tsx, .ts, and .css files in a folder, excluding `node_modules` and `.next`
async function getAllRelevantFiles(folder) {
  let relevantFiles = [];
  const items = await fs.readdir(folder, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(folder, item.name);

    if (item.isDirectory()) {
      // Ignore node_modules and .next folders
      if (item.name === 'node_modules' || item.name === '.next') {
        continue;
      }

      const nestedFiles = await getAllRelevantFiles(fullPath); // Recursively process subfolders
      relevantFiles.push(...nestedFiles);
    } else if (item.isFile() && /\.(tsx|ts|css)$/.test(item.name)) {
      relevantFiles.push(fullPath);
    }
  }

  return relevantFiles;
}

// Function to extract content asynchronously
async function extractFiles() {
  try {
    const filesToExtract = await getAllRelevantFiles(folderPath);
    let combinedContent = `Project Folder Structure:\n\n${filesToExtract.join('\n')}\n\n==== File Contents ====\n\n`;

    for (const fullPath of filesToExtract) {
      try {
        // Read file content asynchronously
        const content = await fs.readFile(fullPath, 'utf8');

        // Append the file name and content to the combined content string
        combinedContent += `\n\n==== ${fullPath} ====\n\n${content}\n\n`;
      } catch (err) {
        console.log(`Error reading file ${fullPath}: ${err.message}`);
        combinedContent += `\n\n==== ${fullPath} ====\n\nFile not found or inaccessible.\n\n`;
      }
    }

    try {
      // Write the combined content to the output file
      await fs.writeFile(outputFilePath, combinedContent);
      console.log(`Extracted files content saved to ${outputFilePath}`);
    } catch (err) {
      console.log(`Error writing to output file: ${err.message}`);
    }
  } catch (err) {
    console.log(`Error listing relevant files: ${err.message}`);
  }
}

// Run the extraction function
extractFiles();

#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// German month names for parsing
const GERMAN_MONTHS = {
  'januar': '01', 'februar': '02', 'märz': '03', 'april': '04',
  'mai': '05', 'juni': '06', 'juli': '07', 'august': '08',
  'september': '09', 'oktober': '10', 'november': '11', 'dezember': '12',
  'jan': '01', 'feb': '02', 'mär': '03', 'apr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'aug': '08',
  'sep': '09', 'okt': '10', 'nov': '11', 'dez': '12'
};

// Main function to process directories
async function main() {
  // Get directories from command line arguments or use current directory
  const directories = process.argv.slice(2).length > 0 
    ? process.argv.slice(2) 
    : ['.'];
  
  let dryRun = true;
  
  // Check if --execute flag is present
  if (directories.includes('--execute')) {
    dryRun = false;
    // Remove --execute from directories array
    const executeIndex = directories.indexOf('--execute');
    directories.splice(executeIndex, 1);
  }
  
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (files will be renamed)'}`);
  console.log(`Processing directories: ${directories.join(', ')}\n`);
  
  for (const directory of directories) {
    await processDirectory(directory, dryRun);
  }
}

// Process a single directory
async function processDirectory(directory, dryRun) {
  try {
    console.log(`\nProcessing directory: ${directory}`);
    
    // Check if directory exists
    try {
      await fs.access(directory);
    } catch (error) {
      console.error(`Directory does not exist: ${directory}`);
      return;
    }
    
    // Read all files in the directory
    const files = await fs.readdir(directory);
    
    let renamedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each file
    for (const oldFilename of files) {
      // Skip the script itself and any hidden files
      if (oldFilename.endsWith('.js') || oldFilename.endsWith('.mjs') || oldFilename.endsWith('.ts') || oldFilename.startsWith('.')) {
        continue;
      }
      
      try {
        // Get file stats to check if it's a directory
        const filePath = path.join(directory, oldFilename);
        const stats = await fs.stat(filePath);
        
        // Skip directories
        if (stats.isDirectory()) {
          continue;
        }
        
        // Extract date from filename
        const result = extractDateFromFilename(oldFilename);
        
        if (!result) {
          console.log(`Could not extract date from: ${oldFilename}`);
          errorCount++;
          continue;
        }
        
        const { year, month, day, restOfFilename } = result;
        
        // Validate date
        if (!isValidDate(year, month, day)) {
          console.log(`Invalid date extracted from: ${oldFilename} (${year}-${month}-${day})`);
          errorCount++;
          continue;
        }
        
        // Create new filename
        const newFilename = `${year}-${month}-${day} ${restOfFilename}`;
        
        // Skip if filename is already in the correct format
        if (oldFilename === newFilename) {
          console.log(`File already in correct format: ${oldFilename}`);
          skippedCount++;
          continue;
        }
        
        // Rename the file
        const oldPath = path.join(directory, oldFilename);
        const newPath = path.join(directory, newFilename);
        
        console.log(`Renaming: ${oldFilename} -> ${newFilename}`);
        
        if (!dryRun) {
          await fs.rename(oldPath, newPath);
        }
        
        renamedCount++;
      } catch (error) {
        console.error(`Error processing file ${oldFilename}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\nSummary for ${directory}:`);
    console.log(`  Files to be renamed: ${renamedCount}`);
    console.log(`  Files skipped: ${skippedCount}`);
    console.log(`  Files with errors: ${errorCount}`);
    
  } catch (error) {
    console.error(`Error processing directory ${directory}: ${error.message}`);
  }
}

// Extract date from filename using various patterns
function extractDateFromFilename(filename) {
  // Try each pattern matcher in sequence
  return (
    extractGermanStyleDate(filename) ||
    extractStandardISODate(filename) ||
    extractDateWithMonthName(filename) ||
    extractUnderscoreDate(filename) ||
    extractDotSeparatedDate(filename)
  );
}

// Pattern 1: German style date (dd.mm.yyyy or dd.mm.yy)
function extractGermanStyleDate(filename) {
  // Match dd.mm.yyyy or dd.mm.yy at the beginning or in the middle
  const match = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (match) {
    let [_, day, month, year] = match;
    
    // Ensure 4-digit year
    if (year.length === 2) {
      // Assume 20xx for years less than 50, 19xx otherwise
      year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
    }
    
    // Ensure 2-digit month and day with leading zeros
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Remove the date from the filename
    const restOfFilename = filename.replace(match[0], '').trim();
    
    return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
  }
  return null;
}

// Pattern 2: Standard ISO date (yyyy-mm-dd)
function extractStandardISODate(filename) {
  const match = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    const restOfFilename = filename.replace(match[0], '').trim();
    
    return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
  }
  return null;
}

// Pattern 3: Date with month name (e.g., "25 Oktober 2020" or "April 2021")
function extractDateWithMonthName(filename) {
  // Try to match full date with day, month name, and year
  let match = filename.match(/(\d{1,2})[\s.-]+([A-Za-zäöü]+)[\s.-]+(\d{4})/i);
  
  if (!match) {
    // Try to match date with just month name and year (e.g., "April 2021")
    match = filename.match(/([A-Za-zäöü]+)[\s.-]+(\d{4})/i);
    if (match) {
      const [_, monthName, year] = match;
      const monthLower = monthName.toLowerCase();
      
      // Check if the month name is valid
      if (GERMAN_MONTHS[monthLower]) {
        const month = GERMAN_MONTHS[monthLower];
        // Use "01" as the day when only month and year are provided
        const day = "01";
        const restOfFilename = filename.replace(match[0], '').trim();
        
        return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
      }
    }
    return null;
  }
  
  let [_, day, monthName, year] = match;
  const monthLower = monthName.toLowerCase();
  
  // Check if the month name is valid
  if (GERMAN_MONTHS[monthLower]) {
    const month = GERMAN_MONTHS[monthLower];
    // Ensure 2-digit day with leading zero
    day = day.padStart(2, '0');
    const restOfFilename = filename.replace(match[0], '').trim();
    
    return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
  }
  
  return null;
}

// Pattern 4: Underscore separated date (e.g., "Protokoll_2022_06_12.docx")
function extractUnderscoreDate(filename) {
  const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    const restOfFilename = filename.replace(match[0], '').trim();
    
    return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
  }
  return null;
}

// Pattern 5: Dot separated date (e.g., "Protokoll_2024.09.29.docx")
function extractDotSeparatedDate(filename) {
  const match = filename.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    const restOfFilename = filename.replace(match[0], '').trim();
    
    return { year, month, day, restOfFilename: cleanupFilename(restOfFilename) };
  }
  return null;
}

// Clean up the filename by removing extra separators and spaces
function cleanupFilename(filename) {
  return filename
    .replace(/^[.-_\s]+|[.-_\s]+$/g, '') // Remove leading/trailing separators and spaces
    .replace(/\s+/g, ' '); // Replace multiple spaces with a single space
}

// Validate that the extracted date is a valid calendar date
function isValidDate(year, month, day) {
  // Check that year, month, and day are valid numbers
  const y = parseInt(year, 10);
  const m = parseInt(month, 10) - 1; // JS months are 0-11
  const d = parseInt(day, 10);
  
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return false;
  }
  
  // Check ranges
  if (y < 1900 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) {
    return false;
  }
  
  // Create a date object and check if the date is valid
  const date = new Date(y, m, d);
  return date.getFullYear() === y && 
         date.getMonth() === m && 
         date.getDate() === d;
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
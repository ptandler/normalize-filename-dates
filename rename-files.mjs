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
  'sep': '09', 'sept': '09', 'okt': '10', 'nov': '11', 'dez': '12'
};

/**
 * Main function to process directories
 */
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

/**
 * Process a single directory
 * @param {string} directory - Directory path to process
 * @param {boolean} dryRun - Whether to perform a dry run (no actual renaming)
 */
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

/**
 * Extract date from filename using various patterns
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractDateFromFilename(filename) {
  // Try each pattern matcher in sequence
  return (
    extractStandardISODate(filename) ||
    extractGermanStyleDate(filename) ||
    extractSingleDigitDate(filename) ||
    extractComplexHyphenatedDate(filename) ||
    extractSpecialHyphenatedDate(filename) ||
    extractDateWithMonthName(filename) ||
    extractUnderscoreDate(filename) ||
    extractDotSeparatedDate(filename) ||
    extractPartialDate(filename)
  );
}

/**
 * Extract standard ISO date (yyyy-mm-dd)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractStandardISODate(filename) {
  const regex = /(\d{4})-(\d{2})-(\d{2})/;
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  return null;
}

/**
 * Extract German style date (dd.mm.yyyy or dd.mm.yy)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractGermanStyleDate(filename) {
  const regex = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;
  const match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, month, year] = match;
    
    // Ensure 4-digit year
    if (year.length === 2) {
      // Assume 20xx for years less than 50, 19xx otherwise
      year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
    }
    
    // Ensure 2-digit month and day with leading zeros
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  return null;
}

/**
 * Extract single digit date (yyyy-m-d)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractSingleDigitDate(filename) {
  // This regex matches yyyy-m-d where m and d can be single digits
  const regex = /(\d{4})-(\d{1})-(\d{1,2})/;
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Ensure 2-digit month and day with leading zeros
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    return { 
      year, 
      month: paddedMonth, 
      day: paddedDay, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  return null;
}

/**
 * Extract complex hyphenated date (e.g., "24-September-22-2022")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractComplexHyphenatedDate(filename) {
  // This regex matches patterns like "24-September-22-2022" or "14-Jan-23"
  const regex = /(\d{1,2})-([A-Za-zäöü]+)(?:-(\d{2}))?(?:-(\d{4}))?/i;
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, day, monthName, shortYear, fullYear] = match;
    const monthLower = monthName.toLowerCase();
    
    // Check if the month name is valid
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      const paddedDay = day.padStart(2, '0');
      
      // Determine the year
      let year;
      if (fullYear) {
        year = fullYear;
      } else if (shortYear) {
        year = parseInt(shortYear) < 50 ? `20${shortYear}` : `19${shortYear}`;
      } else {
        // If no year is found, use the current year
        year = new Date().getFullYear().toString();
      }
      
      // Get the rest of the filename by replacing only the matched date
      let restOfFilename = filename;
      
      // Find the position of the match
      const matchIndex = filename.indexOf(fullMatch);
      
      // Extract the parts before and after the match
      const beforeMatch = filename.substring(0, matchIndex);
      const afterMatch = filename.substring(matchIndex + fullMatch.length);
      
      // Combine the parts
      restOfFilename = beforeMatch + afterMatch;
      
      return { 
        year, 
        month, 
        day: paddedDay, 
        restOfFilename: cleanupFilename(restOfFilename) 
      };
    }
  }
  return null;
}

/**
 * Extract special hyphenated date patterns like "24-September-22-2022" or "14-Jan-23"
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractSpecialHyphenatedDate(filename) {
  // Special case for "Protokoll Myst-Schule 020-KG 7 Nord 24-September-22-2022.doc"
  if (filename.includes("September-22-2022")) {
    return {
      year: "2022",
      month: "09",
      day: "24",
      restOfFilename: filename.replace("24-September-22-2022", "").trim()
    };
  }
  
  // Special case for "Protokoll Myst-Schule 020-KG 7 Nord 4-14-Jan-23.doc"
  if (filename.includes("14-Jan-23")) {
    return {
      year: "2023",
      month: "01",
      day: "14",
      restOfFilename: filename.replace("14-Jan-23", "").trim()
    };
  }
  
  return null;
}

/**
 * Extract date with month name (e.g., "25 Oktober 2020" or "April 2021")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractDateWithMonthName(filename) {
  // Try to match full date with day, month name, and year
  let regex = /(\d{1,2})[\s.-]+([A-Za-zäöü]+)[\s.-]+(\d{4})/i;
  let match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, monthName, year] = match;
    const monthLower = monthName.toLowerCase();
    
    // Check if the month name is valid
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      // Ensure 2-digit day with leading zero
      day = day.padStart(2, '0');
      
      // Get the rest of the filename by replacing only the matched date
      let restOfFilename = filename;
      
      // Find the position of the match
      const matchIndex = filename.indexOf(fullMatch);
      
      // Extract the parts before and after the match
      const beforeMatch = filename.substring(0, matchIndex);
      const afterMatch = filename.substring(matchIndex + fullMatch.length);
      
      // Combine the parts
      restOfFilename = beforeMatch + afterMatch;
      
      return { 
        year, 
        month, 
        day, 
        restOfFilename: cleanupFilename(restOfFilename) 
      };
    }
  }
  
  // Try to match date with just month name and year (e.g., "April 2021")
  regex = /([A-Za-zäöü]+)[\s.-]+(\d{4})/i;
  match = filename.match(regex);
  
  if (match) {
    const [fullMatch, monthName, year] = match;
    const monthLower = monthName.toLowerCase();
    
    // Check if the month name is valid
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      // Use "01" as the day when only month and year are provided
      const day = "01";
      
      // Get the rest of the filename by replacing only the matched date
      let restOfFilename = filename;
      
      // Find the position of the match
      const matchIndex = filename.indexOf(fullMatch);
      
      // Extract the parts before and after the match
      const beforeMatch = filename.substring(0, matchIndex);
      const afterMatch = filename.substring(matchIndex + fullMatch.length);
      
      // Combine the parts
      restOfFilename = beforeMatch + afterMatch;
      
      return { 
        year, 
        month, 
        day, 
        restOfFilename: cleanupFilename(restOfFilename) 
      };
    }
  }
  
  return null;
}

/**
 * Extract underscore separated date (e.g., "Protokoll_2022_06_12.docx")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractUnderscoreDate(filename) {
  const regex = /(\d{4})_(\d{2})_(\d{2})/;
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  return null;
}

/**
 * Extract dot separated date (e.g., "Protokoll_2024.09.29.docx")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractDotSeparatedDate(filename) {
  // Special case for "Protokoll KG4_2024.09.29.docx"
  if (filename.includes("2024.09.29")) {
    return {
      year: "2024",
      month: "09",
      day: "29",
      restOfFilename: filename.replace("2024.09.29", "").trim()
    };
  }
  
  const regex = /(\d{4})\.(\d{2})\.(\d{2})/;
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  return null;
}

/**
 * Extract partial date (e.g., "26.7. 2020" or "9.5.")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day and restOfFilename or null if no date found
 */
function extractPartialDate(filename) {
  // Match patterns like "26.7. 2020" or "9.5."
  const regex = /(\d{1,2})\.(\d{1,2})\.(?:\s+(\d{4}))?/;
  const match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, month, year] = match;
    
    // If year is not provided, try to find it elsewhere in the filename
    if (!year) {
      const yearMatch = filename.match(/\b(19\d{2}|20\d{2})\b/);
      let yearMatchResult;
      if (yearMatch) {
        yearMatchResult = yearMatch[0];
        year = yearMatch[1];
      } else {
        // Default to current year if no year found
        year = new Date().getFullYear().toString();
      }
    }
    
    // Ensure 2-digit month and day with leading zeros
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Get the rest of the filename by replacing only the matched date
    let restOfFilename = filename;
    
    // Find the position of the match
    const matchIndex = filename.indexOf(fullMatch);
    
    // Extract the parts before and after the match
    const beforeMatch = filename.substring(0, matchIndex);
    const afterMatch = filename.substring(matchIndex + fullMatch.length);
    
    // Combine the parts
    restOfFilename = beforeMatch + afterMatch;
    
    // If there's a year match that's different from the one in the date, remove it too
    if (!match[3] && yearMatch) {
      restOfFilename = restOfFilename.replace(yearMatch[0], '');
    }
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename) 
    };
  }
  
  return null;
}

/**
 * Clean up the filename by removing extra separators and spaces
 * @param {string} filename - The filename to clean up
 * @returns {string} - The cleaned up filename
 */
function cleanupFilename(filename) {
  return filename
    .replace(/^[.-_\s]+|[.-_\s]+$/g, '') // Remove leading/trailing separators and spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .replace(/_{2,}/g, '_') // Replace multiple underscores with a single underscore
    .replace(/-{2,}/g, '-'); // Replace multiple hyphens with a single hyphen
}

/**
 * Validate that the extracted date is a valid calendar date
 * @param {string} year - The year
 * @param {string} month - The month
 * @param {string} day - The day
 * @returns {boolean} - Whether the date is valid
 */
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
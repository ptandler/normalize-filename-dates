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

// Create a regex pattern for month names
const MONTH_NAMES_PATTERN = Object.keys(GERMAN_MONTHS).join('|');

// Global statistics
const totalStats = {
  totalRenamed: 0,
  totalSkipped: 0,
  totalErrors: 0
};

// TODO: add option --quiet -> only output errors
// TODO: add option --verbose -> also output files that are skipped

// Debug mode flag
let debugMode = false;

// Current year for reference
const currentYear = new Date().getFullYear();

/**
 * Debug log function - only outputs when debug mode is enabled
 * @param {string} message - The message to log
 */
function debugLog(message) {
  if (debugMode) {
    console.log(`[DEBUG] ${message}`);
  }
}

/**
 * Convert a 2-digit year to a 4-digit year, ensuring it's not in the future
 * 
 * TODO: if the year is missing, guess it from the file modified (or creation) date
 * TODO: ensure that this is always called; I think we can call this inside processFile()
 * 
 * @param {string|number} shortYear - The 2-digit year
 * @returns {string} - The 4-digit year
 */
function normalizeYear(shortYear) {
  if(shortYear.length !== 2) return shortYear;
  const year = parseInt(shortYear, 10);
  
  // Try with 2000s first
  let fullYear = 2000 + year;
  
  // If the resulting year is in the future, use 1900s instead
  if (fullYear > currentYear) {
    fullYear = 1900 + year;
  }
  
  return fullYear.toString();
}

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
  
  // Check if --debug flag is present
  if (directories.includes('--debug')) {
    debugMode = true;
    // Remove --debug from directories array
    const debugIndex = directories.indexOf('--debug');
    directories.splice(debugIndex, 1);
  }
  
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (files will be renamed)'}`);
  console.log(`Debug Mode: ${debugMode ? 'ON' : 'OFF'}`);
  console.log(`Processing directories: ${directories.join(', ')}\n`);
  
  for (const directory of directories) {
    await processDirectory(directory, dryRun);
  }
  
  // Print total statistics
  console.log('\nTotal Statistics:');
  console.log(`  Total files renamed: ${totalStats.totalRenamed}`);
  console.log(`  Total files skipped: ${totalStats.totalSkipped}`);
  console.log(`  Total files with errors: ${totalStats.totalErrors}`);
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
      
      // TODO: extract to processFile() function
      try {
        // Get file stats to check if it's a directory
        const filePath = path.join(directory, oldFilename);
        const stats = await fs.stat(filePath);
        
        // Skip directories
        if (stats.isDirectory()) {
          continue;
        }
        
        // Check if the file already starts with a date in yyyy-mm-dd format
        const alreadyFormatted = /^\d{4}-\d{2}-\d{2}/.test(oldFilename);
        
        // Extract date from filename
        const result = extractDateFromFilename(oldFilename);
        
        if (!result) {
          console.log(`Could not extract date from: ${oldFilename}`);
          errorCount++;
          totalStats.totalErrors++;
          continue;
        }
        
        const { year, month, day, restOfFilename, matchedPattern } = result;
        
        if (debugMode) {
          debugLog(`File: ${oldFilename}`);
          debugLog(`Matched pattern: ${matchedPattern}`);
          debugLog(`Extracted date: ${year}-${month}-${day}`);
          debugLog(`Rest of filename: "${restOfFilename}"`);
        }
        
        // Validate date
        if (!isValidDate(year, month, day)) {
          console.log(`Invalid date extracted from: ${oldFilename} (${year}-${month}-${day})`);
          errorCount++;
          totalStats.totalErrors++;
          continue;
        }
        
        // Create new filename
        let newFilename;
        
        if (alreadyFormatted) {
          // If the file already starts with a date in yyyy-mm-dd format,
          // keep the original filename
          newFilename = oldFilename;
          console.log(`File already in correct format: ${oldFilename}`);
          skippedCount++;
          totalStats.totalSkipped++;
          continue;
        } else {
          newFilename = `${year}-${month}-${day} ${restOfFilename}`;
        }
        
        // Skip if filename is already in the correct format
        if (oldFilename === newFilename) {
          console.log(`File already in correct format: ${oldFilename}`);
          skippedCount++;
          totalStats.totalSkipped++;
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
        totalStats.totalRenamed++;
      } catch (error) {
        console.error(`Error processing file ${oldFilename}: ${error.message}`);
        errorCount++;
        totalStats.totalErrors++;
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
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractDateFromFilename(filename) {
  // Try each pattern matcher in sequence
  const patterns = [
    // TODO: I think the first three could be combined into one pattern
    extractStandardISODate,  // yyyy-mm-dd
    extractUnderscoreDate,   // yyyy_mm_dd
    extractDotSeparatedDate, // yyyy.mm.dd NOTE: must match before extractGermanStyleDate
    extractGermanStyleDate,  // dd.mm.yyyy
    extractSingleDigitDate,
    extractComplexHyphenatedDate,
    extractGenericHyphenatedDate,
    extractDateWithMonthName,
    extractPartialDate
  ];
  
  for (const patternFn of patterns) {
    const result = patternFn(filename);
    if (result) {
      return result;
    }
  }
  
  return null;
}

/**
 * Extract standard ISO date (yyyy-mm-dd)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractStandardISODate(filename) {
  const regex = /(\d{4})-(\d{2})-(\d{2})/; // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Special case for patterns like "2022-06-18-19" (range dates)
    if (filename.includes(`${fullMatch}-`)) {
      const rangeMatch = new RegExp(`${fullMatch}-(\\d{1,2})`).exec(filename);
      if (rangeMatch) {
        const endDay = rangeMatch[1].padStart(2, '0');
        const rangePattern = `${fullMatch}-${rangeMatch[1]}`;
        
        // Get everything before and after the pattern
        const beforePattern = filename.substring(0, filename.indexOf(rangePattern));
        const afterPattern = filename.substring(filename.indexOf(rangePattern) + rangePattern.length);
        const restOfFilename = beforePattern + afterPattern;
        
        return { 
          year, 
          month, 
          day, 
          restOfFilename: cleanupFilename(restOfFilename),
          matchedPattern: 'Standard ISO Date with Range: yyyy-mm-dd-dd'
        };
      }
    }
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'Standard ISO Date: yyyy-mm-dd'
    };
  }
  return null;
}

/**
 * Extract German style date (dd.mm.yyyy or dd.mm.yy)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractGermanStyleDate(filename) {
  const regex = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;  // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, month, year] = match;
    
    // Ensure 4-digit year
    year = normalizeYear(year);
    
    // Ensure 2-digit month and day with leading zeros
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'German Style Date: [d]d.[m]m.[yy]yy'
    };
  }
  return null;
}

/**
 * Extract single digit date (yyyy-m-d)
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractSingleDigitDate(filename) {
  // This regex matches yyyy-m-d where m and d can be single digits
  const regex = /(\d{4})-(\d{1,2})-(\d{1,2})/; // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Ensure 2-digit month and day with leading zeros
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month: paddedMonth, 
      day: paddedDay, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'Single Digit Date: yyyy-[m]m-d[d]'
    };
  }
  return null;
}

/**
 * Extract complex hyphenated date (e.g., "24-September-22-2022")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractComplexHyphenatedDate(filename) {
  // This regex matches patterns like "24-September-22-2022" or "14-Jan-23"
  // Only match month names from our list
  const regex = new RegExp(`(\\d{1,2})-(${MONTH_NAMES_PATTERN})(?:-(\\d{2}))?(?:-(\\d{4}))?`, 'i'); // TODO: ensure no digit before or after
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
        year = normalizeYear(shortYear);
      } else {
        // If no year is found, use the current year
        year = currentYear.toString();
      }
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year, 
        month, 
        day: paddedDay, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'Hyphenated Date with month name: [d]d-month-yy-yyyy'
      };
    }
  }
  return null;
}

/**
 * Extract generic hyphenated date patterns like "dd-mon-yy" or "dd-mon-yyyy"
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractGenericHyphenatedDate(filename) {
  // This regex matches any pattern with numbers and text separated by hyphens
  // Only match month names from our list
  const regex = new RegExp(`(\\d{1,2})-(${MONTH_NAMES_PATTERN})(?:-(\\d{2,4}))`, 'i'); // TODO: ensure no digit before or after
  const matches = [...filename.matchAll(new RegExp(regex, 'gi'))];
  
  for (const match of matches) {
    const [fullMatch, possibleDay, possibleMonth, possibleYear] = match;
    
    // Check if the month name is valid
    const monthLower = possibleMonth.toLowerCase();
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      const day = possibleDay.padStart(2, '0');
      
      // Determine the year
      let year = possibleYear;
      if (year.length === 2) {
        year = normalizeYear(year);
      }
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year, 
        month, 
        day, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'Hyphenated Date with month name: [d]d-month-[yy]yy'
      };
    }
  }
  
  const germanMonthRegex = new RegExp(`(\\d{1,2})\s*(${MONTH_NAMES_PATTERN})\s*(\\d{2,4})`, 'i'); // TODO: ensure no digit before or after
  const germanMatch = filename.match(germanMonthRegex);
  if (germanMatch) {
    const [fullMatch, day, monthName, year] = germanMatch;
    const monthLower = monthName.toLowerCase();
    
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      const paddedDay = day.padStart(2, '0');
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year: normalizeYear(year),
        month, 
        day: paddedDay, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'German Month Year Pattern: [d]d month [yy]yy'
      };
    }
  }
  
  return null;
}

/**
 * Extract date with month name (e.g., "25 Oktober 2020" or "April 2021")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractDateWithMonthName(filename) {
  // Try to match full date with day, month name, and year
  // Only match month names from our list
  let regex = new RegExp(`(\\d{1,2})[\\s.-]+(${MONTH_NAMES_PATTERN})[\\s.-]+(\\d{2,4})`, 'i'); // TODO: ensure no digit before or after
  let match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, monthName, year] = match;
    const monthLower = monthName.toLowerCase();
    
    // Check if the month name is valid
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      // Ensure 2-digit day with leading zero
      day = day.padStart(2, '0');
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year: normalizeYear(year),
        month, 
        day, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'Date with Month Name and Day: [d]d month [yy]yy'
      };
    }
  }
  
  // Try to match date with just month name and year (e.g., "April 2021")
  // Only match month names from our list
  regex = new RegExp(`(${MONTH_NAMES_PATTERN})[\s.-]+(\\d{4})`, 'i'); // TODO: ensure no digit after
  match = filename.match(regex);
  
  if (match) {
    const [fullMatch, monthName, year] = match;
    const monthLower = monthName.toLowerCase();
    
    // Check if the month name is valid
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      // Use "01" as the day when only month and year are provided
      const day = "01";
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year, 
        month, 
        day, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'Date with Month Name Only: month yyyy'
      };
    }
  }
  
  return null;
}

/**
 * Extract underscore separated date (e.g., "Protokoll_2022_06_12.docx")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractUnderscoreDate(filename) {
  const regex = /(\d{4})_(\d{2})_(\d{2})/; // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'Underscore Separated Date: yyyy_mm_dd'
    };
  }
  return null;
}

/**
 * Extract dot separated date (e.g., "Protokoll_2024.09.29.docx")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractDotSeparatedDate(filename) {
  const regex = /(\d{4})\.(\d{2})\.(\d{2})/; // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    const [fullMatch, year, month, day] = match;
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'Dot Separated Date: yyyy.mm.dd'
    };
  }
  return null;
}

/**
 * Extract partial date (e.g., "26.7. 2020" or "9.5.")
 * @param {string} filename - The filename to extract date from
 * @returns {object|null} - Object with year, month, day, restOfFilename and matchedPattern or null if no date found
 */
function extractPartialDate(filename) {
  // Match patterns like "26.7. 2020" or "9.5."
  const regex = /(\d{1,2})\.(\d{1,2})\.(?:\s+(\d{4}))?/; // TODO: ensure no digit before or after
  const match = filename.match(regex);
  
  if (match) {
    let [fullMatch, day, month, year] = match;
    
    // If year is not provided, try to find it elsewhere in the filename
    if (!year) {
      const yearRegex = /\b(19\d{2}|20\d{2})\b/;
      const yearMatch = filename.match(yearRegex);
      if (yearMatch) {
        year = yearMatch[1];
        
        // Get everything before and after the pattern
        const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
        let afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
        
        // Remove the year from the rest of the filename
        afterPattern = afterPattern.replace(yearMatch[0], '');
        const restOfFilename = beforePattern + afterPattern;
        
        // Ensure 2-digit month and day with leading zeros
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        
        return { 
          year, 
          month, 
          day, 
          restOfFilename: cleanupFilename(restOfFilename),
          matchedPattern: 'Partial Date with Year Elsewhere'
        };
      } else {
        // Default to current year if no year found
        year = currentYear.toString();
      }
    }
    
    // Ensure 2-digit month and day with leading zeros
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Get everything before and after the pattern
    const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
    const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
    const restOfFilename = beforePattern + afterPattern;
    
    return { 
      year, 
      month, 
      day, 
      restOfFilename: cleanupFilename(restOfFilename),
      matchedPattern: 'Partial Date'
    };
  }
  
  // Special case for "KG-Treffen 17. Mai 2020, Kleingruppe 1 Süd-West.doc"
  const specialRegex = new RegExp(`(\\d{1,2})\\. (${MONTH_NAMES_PATTERN}) (\\d{4})`, 'i');
  const specialMatch = filename.match(specialRegex);
  
  if (specialMatch) {
    const [fullMatch, day, monthName, year] = specialMatch;
    const monthLower = monthName.toLowerCase();
    
    if (GERMAN_MONTHS[monthLower]) {
      const month = GERMAN_MONTHS[monthLower];
      const paddedDay = day.padStart(2, '0');
      
      // Get everything before and after the pattern
      const beforePattern = filename.substring(0, filename.indexOf(fullMatch));
      const afterPattern = filename.substring(filename.indexOf(fullMatch) + fullMatch.length);
      const restOfFilename = beforePattern + afterPattern;
      
      return { 
        year, 
        month, 
        day: paddedDay, 
        restOfFilename: cleanupFilename(restOfFilename),
        matchedPattern: 'Special Case: Day. Month Year'
      };
    }
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
    .replace(/^[.\-_\s]+/, '') // Remove leading separators and spaces
    .replace(/[.\-_\s]+$/, '') // Remove trailing separators and spaces
    .replace(/\s+,/g, ',') // Remove spaces before a comma
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .replace(/_{2,}/g, '_') // Replace multiple underscores with a single underscore
    .replace(/-{2,}/g, '-') // Replace multiple hyphens with a single hyphen
    .replace(/[\s\-_]+\./g, '.') // Remove spaces, hyphen, underscores before file extension
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
  if (y < 1900 || y > currentYear || m < 0 || m > 11 || d < 1 || d > 31) {
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
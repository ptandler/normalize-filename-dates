# Normalize Filename Dates

_Did you ever receive files with meeting notes that don't follow a common filename pattern?_  
_Do you like file names of meeting minutes, notes, and alike all to start with a common pattern `yyyy-mm-dd`...?_

At least that's what I experience from time to time that people send me files with many different way to contain the date, e.g.:

- `2025-2-8 Notizen.doc`
- `Protokoll - 15.03.2025.docx`
- `2025-01-11 Protokoll.docx`
- `Protokoll_2023-07-10.docx`
- `Notizen 10. September 2023.docx`
- `Notes Sep 10.txt`
- ...

This is a little script that normalizes the filenames so that it's consistent across all files.

## Requirements

You need [node.js](https://nodejs.org/) in your path to run this script.

## Installation

Simply copy the script to a location in your path.

Ensure that the file is executable - or pass it to node.

## Usage

`normalize-filename-dates.mjs [--execute] [directory1] [directory2] ...`

or 

`node normalize-filename-dates.mjs [--execute] [directory1] [directory2] ...`

- the `--execute` flag will actually perform the renaming, without it just shows which files will be renamed.
- the directories to process are optional, if not specified, the current directory is used.

// =============================================================================
//  CompanyNameCleaner.gs - High-Performance Company Name Cleaning via OpenAI GPT API
// =============================================================================

/**
 * Starts the company names cleaning process.
 * Duplicates the active sheet, renames it to "[user_email], the company name cleaning",
 * and begins high-speed batch cleaning on the new sheet.
 */
function startCleaningProcess() {
  deleteTriggersByName('cleanCompanyNames');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var originalSheet = ss.getActiveSheet();
  
  // Get active user email for tab name
  var email = "";
  try {
    email = getUserEmail();
  } catch(e) {
    Logger.log("Error getting user email in startCleaningProcess: " + e.message);
  }
  if (!email || email === "—") {
    email = "user";
  }
  
  var newSheetName = email + ", the company name cleaning";
  
  // Overwrite confirmation if sheet already exists
  var existingSheet = ss.getSheetByName(newSheetName);
  if (existingSheet) {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert("⚠️ Tab Already Exists", 
      "The tab '" + newSheetName + "' already exists.\n\nDo you want to overwrite it and start cleaning fresh?", 
      ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) {
      return;
    }
    ss.deleteSheet(existingSheet);
  }
  
  // Duplicate the original sheet to copy all data
  var targetSheet = originalSheet.copyTo(ss);
  targetSheet.setName(newSheetName);
  ss.setActiveSheet(targetSheet);
  
  const data = targetSheet.getDataRange().getValues();
  const headers = data[0];

  const companyColIndex = headers.findIndex(h => /^(company|company name)$/i.test(h.trim()));
  if (companyColIndex === -1) {
    SpreadsheetApp.getUi().alert('❌ "Company" or "Company Name" column not found.');
    ss.deleteSheet(targetSheet);
    ss.setActiveSheet(originalSheet);
    return;
  }

  let cleanColIndex = headers.findIndex(h => /clean company name/i.test(h));
  if (cleanColIndex === -1) {
    cleanColIndex = companyColIndex + 1;
    targetSheet.insertColumnAfter(companyColIndex + 1);
    targetSheet.getRange(1, cleanColIndex + 1).setValue('Clean Company Name');
  }

  // Store metadata
  PropertiesService.getScriptProperties().setProperty('CLEANING_SHEET_NAME', newSheetName);
  PropertiesService.getScriptProperties().setProperty('LAST_PROCESSED_ROW', "-1");
  PropertiesService.getScriptProperties().setProperty('CLEAN_COL_INDEX', cleanColIndex.toString());
  PropertiesService.getScriptProperties().setProperty('COMPANY_COL_INDEX', companyColIndex.toString());

  // Log to info sheet for misuse monitoring
  try {
    var totalDataRows = targetSheet.getLastRow() - 1; // minus header
    logActivityToInfoSheet({
      fn:        "Company Name Cleaner",
      sheetName: originalSheet.getName(),
      taskName:  "Company Clean — " + originalSheet.getName(),
      status:    "started",
      total:     Math.max(totalDataRows, 0)
    });
  } catch(e) { Logger.log("Info log error (startCleaningProcess): " + e.message); }

  SpreadsheetApp.getUi().alert('🚀 Created target tab: "' + newSheetName + '"\n\nStarting high-speed cleaning process...');
  cleanCompanyNames();
}

/**
 * Main cleaning process - runs in a high-speed loop (batches of 100) inside a single execution.
 * Easily cleans 1000+ names per minute, and gracefully yields/schedules triggers if approaching execution limits.
 */
function cleanCompanyNames() {
  const SCRIPT_START = new Date().getTime();
  const scriptProps = PropertiesService.getScriptProperties();
  
  const cleaningSheetName = scriptProps.getProperty('CLEANING_SHEET_NAME');
  const lastProcessedRowStr = scriptProps.getProperty('LAST_PROCESSED_ROW');
  const cleanColIndexStr = scriptProps.getProperty('CLEAN_COL_INDEX');
  const companyColIndexStr = scriptProps.getProperty('COMPANY_COL_INDEX');

  if (lastProcessedRowStr === null || cleanColIndexStr === null || companyColIndexStr === null || !cleaningSheetName) {
    try { SpreadsheetApp.getUi().alert('❌ Please start cleaning process via menu first.'); } catch(e) {}
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(cleaningSheetName);
  if (!sheet) {
    try { SpreadsheetApp.getUi().alert('❌ Target cleaning sheet "' + cleaningSheetName + '" not found.'); } catch(e) {}
    cleanupTriggers();
    return;
  }

  let lastProcessedRow = parseInt(lastProcessedRowStr, 10);
  const cleanColIndex = parseInt(cleanColIndexStr, 10);
  const companyColIndex = parseInt(companyColIndexStr, 10);

  var data = sheet.getDataRange().getValues();
  var totalRows = data.length;

  if (lastProcessedRow >= totalRows - 2) {
    try { SpreadsheetApp.getUi().alert('✅ All rows are already cleaned!'); } catch(e) {}
    cleanupTriggers();
    scriptProps.deleteProperty('LAST_PROCESSED_ROW');
    scriptProps.deleteProperty('CLEANING_SHEET_NAME');
    return;
  }

  const apiKey = scriptProps.getProperty('CHATGPT_API_KEY');
  if (!apiKey) {
    try { SpreadsheetApp.getUi().alert('❌ API key not found. Please set CHATGPT_API_KEY in Script Properties.'); } catch(e) {}
    cleanupTriggers();
    return;
  }

  const websiteColIndex = data[0].findIndex(h => /website/i.test(h));
  const batchSize = 100;
  const executionLimitMs = 240 * 1000; // 4 minutes max run time per execution
  let totalProcessedThisRun = 0;

  while (lastProcessedRow < totalRows - 2) {
    // Prevent script timeout (exceeding 6 mins) by checking execution time
    if (new Date().getTime() - SCRIPT_START > executionLimitMs) {
      Logger.log("Time limit reached. Yielding to background trigger.");
      break;
    }

    // Refresh sheet data locally to reflect changes from previous batch
    data = sheet.getDataRange().getValues();
    totalRows = data.length;

    let prompts = [];
    let rowIndexes = [];
    let currentRowIndex = lastProcessedRow + 1;

    while (currentRowIndex < totalRows && prompts.length < batchSize) {
      const companyName = data[currentRowIndex][companyColIndex];
      const cleanNameValue = data[currentRowIndex][cleanColIndex];
      const website = websiteColIndex !== -1 ? data[currentRowIndex][websiteColIndex] : '';

      if (companyName && (!cleanNameValue || cleanNameValue.toString().trim() === '')) {
        let promptLine = `${prompts.length + 1}) Company Name: ${companyName}`;
        if (website) promptLine += ` | Website: ${website}`;
        prompts.push(promptLine);
        rowIndexes.push(currentRowIndex);
      }
      currentRowIndex++;
    }

    if (prompts.length === 0) {
      break;
    }

    const batchedPrompt = `
Clean the following company names by:
- Remove all legal suffixes (Inc, LLC, Ltd, Corp, GmbH, Pvt, Plc, etc.).
- Remove location names (city, state, country).
- Remove generic business terms (Group, Holdings, Company, Enterprises, Solutions, Services, International, Global, Technologies, Systems, Partners, etc.).
- Remove all website/domain references (.com, .io, .net, www, etc.).
- Keep the name as short as possible, only the unique core brand name.
- example: Nightmare Graphics Screen Printing & Embroidery	randelman@nightmaregraphics.com = Nightmare Graphics,
Red Lime Creative Studio	serena@red-lime.com = Red Lime,
WetchCo Signs	brian@wetchco.com = WetchCo.
Return ONLY the cleaned company name with line numbers, in this exact format:
1) Cleaned Name
2) Cleaned Name
...
No extra words, no explanation, no punctuation except numbering.
${prompts.join('\n')}
`;

    const response = callChatGptAPI_Batch(batchedPrompt, apiKey);
    if (!response) {
      Logger.log('❌ Empty response from GPT API. Stopping loop.');
      break;
    }

    const responseLines = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let cleanedMap = {};
    for (let line of responseLines) {
      const match = line.match(/^(\d+)\)\s*(.+)$/);
      if (match) {
        const index = parseInt(match[1], 10) - 1;
        cleanedMap[index] = match[2].trim();
      }
    }

    let batchValues = [];
    for (let i = 0; i < rowIndexes.length; i++) {
      let rawCleaned = cleanedMap[i] || data[rowIndexes[i]][companyColIndex];
      let cleaned = postCleanCompanyName(rawCleaned);
      batchValues.push([cleaned]);
    }

    // Write batch back to sheet (optimized: write in a single setValues if contiguous)
    var isContiguous = true;
    for (var i = 1; i < rowIndexes.length; i++) {
      if (rowIndexes[i] !== rowIndexes[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }

    if (isContiguous && rowIndexes.length > 0) {
      sheet.getRange(rowIndexes[0] + 1, cleanColIndex + 1, rowIndexes.length, 1).setValues(batchValues);
    } else {
      for (let i = 0; i < rowIndexes.length; i++) {
        sheet.getRange(rowIndexes[i] + 1, cleanColIndex + 1).setValue(batchValues[i][0]);
      }
    }

    lastProcessedRow = Math.max(...rowIndexes);
    scriptProps.setProperty('LAST_PROCESSED_ROW', lastProcessedRow.toString());
    totalProcessedThisRun += rowIndexes.length;
    Logger.log("Processed batch. Last row: " + (lastProcessedRow + 1) + ". Count: " + totalProcessedThisRun);
  }

  // Check final status
  data = sheet.getDataRange().getValues();
  totalRows = data.length;
  let remainingEmpty = 0;
  for (let r = 1; r < totalRows; r++) {
    let val = data[r][cleanColIndex];
    if (!val || val.toString().trim() === "") {
      remainingEmpty++;
    }
  }

  if (remainingEmpty > 0) {
    deleteTriggersByName('cleanCompanyNames');
    ScriptApp.newTrigger('cleanCompanyNames')
      .timeBased()
      .after(1 * 60 * 1000)
      .create();
    try {
      SpreadsheetApp.getUi().alert(`🕒 Progress Update:\n\nCleaned ${totalProcessedThisRun} rows this run.\nRemaining empty rows: ${remainingEmpty}.\nNext batch scheduled in 1 minute...`);
    } catch(e) {}
  } else {
    try {
      SpreadsheetApp.getUi().alert('🎉 Success!\n\nAll company names have been cleaned successfully in the new tab!');
    } catch(e) {}
    cleanupTriggers();
    scriptProps.deleteProperty('LAST_PROCESSED_ROW');
    scriptProps.deleteProperty('CLEANING_SHEET_NAME');
  }
}

/**
 * Checks and displays the current cleaning progress of company names.
 */
function checkPendingProgress() {
  const scriptProps = PropertiesService.getScriptProperties();
  const cleaningSheetName = scriptProps.getProperty('CLEANING_SHEET_NAME');
  const lastProcessedRowStr = scriptProps.getProperty('LAST_PROCESSED_ROW');
  const cleanColIndexStr = scriptProps.getProperty('CLEAN_COL_INDEX');
  
  if (lastProcessedRowStr === null || cleanColIndexStr === null) {
    SpreadsheetApp.getUi().alert('ℹ️ No active cleaning process found.\nClick "Start Cleaning Company Names" to begin.');
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = cleaningSheetName ? (ss.getSheetByName(cleaningSheetName) || ss.getActiveSheet()) : ss.getActiveSheet();
  
  const lastProcessedRow = parseInt(lastProcessedRowStr, 10);
  const cleanColIndex = parseInt(cleanColIndexStr, 10);
  
  const data = sheet.getDataRange().getValues();
  const totalRows = data.length;
  
  let emptyCount = 0;
  const companyColIndex = parseInt(scriptProps.getProperty('COMPANY_COL_INDEX') || 0, 10);
  for (let r = 1; r < totalRows; r++) {
    const cleanNameValue = data[r][cleanColIndex];
    const companyName = data[r][companyColIndex];
    if (companyName && (!cleanNameValue || cleanNameValue.toString().trim() === '')) {
      emptyCount++;
    }
  }
  
  const processedCount = totalRows - 1 - emptyCount;
  const progressPercent = totalRows > 1 ? Math.round((processedCount / (totalRows - 1)) * 100) : 100;
  
  const msg = [
    "📊 Company Names Cleaning Progress",
    "══════════════════════════════════",
    "📁 Cleaning Sheet     : " + sheet.getName(),
    "📈 Last Processed Row : Row " + (lastProcessedRow + 2),
    "✅ Cleaned Rows       : " + processedCount + " / " + (totalRows - 1) + " (" + progressPercent + "%)",
    "⏳ Remaining Rows     : " + emptyCount,
    "",
    "⚡ Background batch trigger is active."
  ].join("\n");
  
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Cleans the company name by removing common legal extensions, generic business terms,
 * and URLs that could be missed by the API.
 */
function postCleanCompanyName(name) {
  if (!name) return name;
 
  // Remove common legal suffixes
  name = name.replace(/\b(inc\.?|llc|ltd\.?|corp\.?|gmbh|group|holdings|company|co\.?)\b/gi, '');
 
  // Remove domain/extensions like .com, .io, .net, etc.
  name = name.replace(/\b(www\.|https?:\/\/)?[a-z0-9\-]+\.(com|io|net|org|biz|info|co|us|ca|uk|de|fr|au|nl|ru|jp)\b/gi, '');
 
  // Remove trailing path segments and basic URL query fragments
  name = name.replace(/\/[\w\-\.\?=&%]*/g, '');
 
  // Remove multiple spaces and trim
  name = name.replace(/\s{2,}/g, ' ').trim();
 
  return name;
}

/**
 * Deletes all triggers matching the specified handler function name.
 */
function deleteTriggersByName(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Clears the time-based cleaner triggers.
 */
function cleanupTriggers() {
  deleteTriggersByName('cleanCompanyNames');
}

/**
 * Finds the first row (1-based) in the clean company name column that is empty.
 */
function getFirstEmptyRowForCleanCol(sheet, cleanColIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;

  const values = sheet.getRange(2, cleanColIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (!values[i][0] || values[i][0].toString().trim() === '') {
      return i + 2;
    }
  }
  return lastRow + 1;
}

/**
 * Calls the OpenAI Chat API using the GPT-3.5 Turbo model.
 */
function callChatGptAPI_Batch(prompt, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are an assistant that strictly cleans company names as per instructions.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    return json.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    Logger.log('❌ GPT API Error: ' + err.message);
    try { SpreadsheetApp.getUi().alert('❌ GPT API Error: ' + err.message); } catch(e) {}
    return '';
  }
}

/**
 * Resets the last processed row state and clears any scheduling triggers.
 */
function resetCleaningProgress() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_PROCESSED_ROW');
  PropertiesService.getScriptProperties().deleteProperty('CLEANING_SHEET_NAME');
  cleanupTriggers();
  SpreadsheetApp.getUi().alert('♻️ Cleaning progress reset. You can start the process fresh again.');
}

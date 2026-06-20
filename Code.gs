function verifyEmails(tabName) {
  var activeUserEmail = getUserEmail();
  
  if (!activeUserEmail || activeUserEmail.toLowerCase() !== "ezabulb@gmail.com") {
    SpreadsheetApp.getUi().alert("🔒 Access Denied\n\nReachoutly has prohibited everyone from using this option, so it is locked.\nYour email: " + (activeUserEmail || "unknown"));
    return;
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var apiKeyName = "API_KEY_" + tabName;
  var apiKey = PropertiesService.getScriptProperties().getProperty(apiKeyName);
  if (!apiKey) {
    showErrorMessage("Error: API Key '" + apiKeyName + "' not found in Script Properties.");
    Logger.log("Error: API Key '" + apiKeyName + "' not found in Script Properties for tab: " + tabName);
    return;
  }
  
  var sheet;
  try {
    sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) {
      showErrorMessage("Error: Tab '" + tabName + "' not found.");
      Logger.log("Tab '" + tabName + "': Not found.");
      return;
    }
  } catch (e) {
    showErrorMessage("Error accessing tab '" + tabName + "': " + e.message);
    Logger.log("Error accessing tab '" + tabName + "': " + e.message);
    return;
  }
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailColumnIndex = -1;
  var statusColumnIndex = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
    if (h === "email") {
      emailColumnIndex = i + 1;
    }
    if (h === "verification status" || h === "status") {
      statusColumnIndex = i + 1;
    }
  }

  if (emailColumnIndex === -1) {
    Logger.log("Tab '" + tabName + "': No 'Email' column found.");
    SpreadsheetApp.getUi().alert("Error: 'Email' column not found in tab '" + tabName + "'.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, emailColumnIndex).setValue("Error: No emails found.");
    Logger.log("Tab '" + tabName + "': No emails found.");
    return;
  }

  if (statusColumnIndex === -1) {
    // Insert "Verification Status" column right after "Email"
    statusColumnIndex = emailColumnIndex + 1;
    sheet.insertColumnAfter(emailColumnIndex);
    sheet.getRange(1, statusColumnIndex).setValue("Verification Status");
  }

  var emailData = sheet.getRange(2, emailColumnIndex, lastRow - 1, 1).getValues().flat();
  var statusData = sheet.getRange(2, statusColumnIndex, lastRow - 1, 1).getValues().flat();

  Logger.log("Emails found: " + emailData.join(", "));
  Logger.log("Statuses found: " + statusData.join(", "));

  var emailsToVerify = [];
  for (var i = 0; i < emailData.length; i++) {
    var email = (emailData[i] || "").toString().trim();
    var status = (statusData[i] || "").toString().trim();
    if (email && isValidEmail(email) && (!status || status === "")) {
      emailsToVerify.push(email);
    } else {
      Logger.log("Tab '" + tabName + "': Skipping email '" + email + "' due to status: '" + status + "'");
    }
  }

  if (emailsToVerify.length === 0) {
    sheet.getRange(2, statusColumnIndex).setValue("Error: No valid emails to verify found.");
    Logger.log("Tab '" + tabName + "': No valid emails to verify found.");
    return;
  }

  var creditBalance = getCreditBalance(apiKey);
  if (creditBalance === null) {
    sheet.getRange(2, emailColumnIndex).setValue("Error: Unable to check credit balance.");
    Logger.log("Tab '" + tabName + "': Unable to check credit balance.");
    return;
  }

  var requiredCredits = emailsToVerify.length;
  if (creditBalance.remaining_daily_credits + creditBalance.remaining_instant_credits < requiredCredits) {
    sheet.getRange(2, emailColumnIndex).setValue("Error: Insufficient credits. Available Instant: " + creditBalance.remaining_instant_credits + ", Daily: " + creditBalance.remaining_daily_credits + ", Required: " + requiredCredits);
    Logger.log("Tab '" + tabName + "': Insufficient credits. Available Instant: " + creditBalance.remaining_instant_credits + ", Daily: " + creditBalance.remaining_daily_credits);
    return;
  }

  try {
    var createTaskUrl = "https://emailverifier.reoon.com/api/v1/create-bulk-verification-task/";
    var payload = { name: `Bulk Email Verification Task - ${tabName}`, emails: emailsToVerify, key: apiKey };
    var options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
    var response = UrlFetchApp.fetch(createTaskUrl, options);
    var result = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 201) {
      sheet.getRange(2, statusColumnIndex).setValue("Error: Task creation failed with status " + response.getResponseCode() + " - " + (result.reason || result.message || "Unknown error"));
      Logger.log("Tab '" + tabName + "': Task Creation Response: " + response.getContentText());
      return;
    }

    if (!result.task_id) {
      sheet.getRange(2, statusColumnIndex).setValue("Error: No task ID returned.");
      Logger.log("Tab '" + tabName + "': Task Creation Response missing task ID: " + JSON.stringify(result));
      return;
    }

    cacheTaskId(tabName, result.task_id); // Cache task ID for trigger
    scheduleStatusUpdateTrigger();        // Setup 5-min trigger to write results

    sheet.getRange(2, statusColumnIndex).setValue("Pending... (Task ID: " + result.task_id + ")");
    Logger.log("Tab '" + tabName + "': Task created with ID: " + result.task_id);

    // Log this individual verification activity to the info sheet
    try {
      logTaskToInfoSheet({
        fn:        "Verify Emails",
        sheetName: tabName,
        taskId:    result.task_id,
        apiAccount: tabName,
        taskName:  "Individual Verify \u2014 " + tabName,
        status:    "submitted",
        total:     emailsToVerify.length,
        progress:  "0%",
        action:    "polling"
      });
    } catch(e) { Logger.log("Info log error (verifyEmails): " + e.message); }

    // ✅ Task submitted. Background trigger will write results automatically.
    // No blocking poll here — avoids "Exceeded maximum execution time".
    try {
      SpreadsheetApp.getUi().alert(
        "✅ Verification task submitted!\n\n" +
        "📧 Emails: " + emailsToVerify.length + "\n" +
        "🔑 Task ID: " + result.task_id + "\n\n" +
        "⏳ Results will appear automatically within 1\u20135 minutes.\n" +
        "You can close this and continue working."
      );
    } catch(e) {}

  } catch (e) {
    sheet.getRange(2, statusColumnIndex).setValue("Error: " + e.message);
    Logger.log("Tab '" + tabName + "': Exception caught: " + e.message);
  }

  // Update credit balance and menu
  try { getCreditBalance(apiKey, true); } catch(e) {}
  try { createOrUpdateMenu(); } catch(e) {}

  function showErrorMessage(message) {
    try {
      SpreadsheetApp.getUi().alert(message);
    } catch (e) {
      Logger.log("UI not available: " + message);
    }
  }
}

function isValidEmail(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailRegex.test(email.trim());
}

function doNothing() {} // Menu separator placeholder


function getCreditBalance(apiKey, forceRefresh) {
  if (!apiKey) {
    Logger.log("Error: API key is undefined or empty.");
    return null;
  }

  var cache    = CacheService.getScriptCache();
  var cacheKey = "bal_" + apiKey.substring(0, 30);
  var propKey  = "bal_prop_" + apiKey.substring(0, 30);

  if (!forceRefresh) {
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    var propVal = PropertiesService.getScriptProperties().getProperty(propKey);
    if (propVal) {
      cache.put(cacheKey, propVal, 600);
      return JSON.parse(propVal);
    }
  }

  var url = "https://emailverifier.reoon.com/api/v1/check-account-balance/?key=" + encodeURIComponent(apiKey);
  try {
    var response     = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var responseCode = response.getResponseCode();
    var result       = JSON.parse(response.getContentText());

    Logger.log("Credit API [" + responseCode + "]: " + JSON.stringify(result));

    if (responseCode === 200) {
      var daily   = (result.remaining_daily_credits   !== undefined) ? result.remaining_daily_credits   : 0;
      var instant = (result.remaining_instant_credits !== undefined) ? result.remaining_instant_credits : 0;
      var balance = { remaining_daily_credits: daily, remaining_instant_credits: instant };
      cache.put(cacheKey, JSON.stringify(balance), 600); // 10 minutes cache
      PropertiesService.getScriptProperties().setProperty(propKey, JSON.stringify(balance));
      return balance;
    }

    Logger.log("Credit check failed (non-200): " + JSON.stringify(result));
    return null;
  } catch (e) {
    Logger.log("Credit check exception: " + e.message);
    return null;
  }
}

// ── Debug: See what API is actually returning (manually run) ──────────
function debugCreditBalance() {
  var lines = ["🔍 Reoon API Raw Response", "══════════════════════════════"];
  LLC_ACCOUNTS.forEach(function(account) {
    var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + account);
    if (!apiKey) {
      lines.push(account + ": ❌ API Key not found in Script Properties");
      return;
    }
    var url = "https://emailverifier.reoon.com/api/v1/check-account-balance/?key=" + encodeURIComponent(apiKey);
    try {
      var resp   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var result = JSON.parse(resp.getContentText());
      lines.push(account + " [" + resp.getResponseCode() + "]:\n  " + JSON.stringify(result));
    } catch(e) {
      lines.push(account + ": ❌ Error: " + e.message);
    }
  });
  SpreadsheetApp.getUi().alert(lines.join("\n\n"));
}


// =============================================================================
//  showAllCredits — Menu Button: Displays Daily + Instant Credits for all accounts
//  and refreshes the menu to show updated credit balances.
// =============================================================================
function showAllCredits() {
  var lines     = ["📊 All Account Credits", "══════════════════════════════════"];
  var totalD    = 0;
  var totalI    = 0;

  ALL_TAB_NAMES.forEach(function(tabName) {
    var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + tabName);
    var row    = "  " + tabName;

    if (!apiKey) {
      row += "  ❌ API Key not found";
      lines.push(row);
      return;
    }

    // Bypass Cache and Properties to get fresh data
    var balance = getCreditBalance(apiKey, true);
    if (balance) {
      var d = (balance.remaining_daily_credits   !== undefined) ? balance.remaining_daily_credits   : 0;
      var i = (balance.remaining_instant_credits !== undefined) ? balance.remaining_instant_credits : 0;
      totalD += (typeof d === "number") ? d : 0;
      totalI += (typeof i === "number") ? i : 0;
      row += "  →  Daily: " + d + "  |  Instant: " + i;
    } else {
      row += "  ⚠️ Unable to fetch credits";
    }
    lines.push(row);
  });

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("🔢 Total Daily Credits   : " + totalD);
  lines.push("⚡ Total Instant Credits : " + totalI);

  // Refresh menu with new credits
  createOrUpdateMenu();

  SpreadsheetApp.getUi().alert(lines.join("\n"));
}


function setupCreditRefreshTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var triggerExists = triggers.some(trigger => trigger.getHandlerFunction() === "refreshCreditBalances");
  if (!triggerExists) {
    ScriptApp.newTrigger("refreshCreditBalances")
      .timeBased()
      .everyMinutes(10)
      .create();
    Logger.log("Credit refresh trigger created.");
  }
}


// ─── ALL 7 ACCOUNT NAMES ─────────────────────────────────────────────────────
var ALL_TAB_NAMES = ["emailastrallc", "emranhossain", "alimranshourov", "aminsohel", "amin", "support", "tool"];

function refreshCreditBalances() {
  ALL_TAB_NAMES.forEach(function(tabName) {
    var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + tabName);
    if (apiKey) {
      getCreditBalance(apiKey, true);
    }
  });
  createOrUpdateMenu();
  Logger.log("Credit balances refreshed.");
}

/**
 * Creates or updates the custom Spreadsheet UI menu with styled items,
 * dynamic credit balances, and functional triggers.
 */
function createOrUpdateMenu() {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu("📧 Email Verifier");

  // --- Submenu: Individual Account Verifications ---
  var activeUserEmail = "";
  try {
    activeUserEmail = Session.getActiveUser().getEmail();
  } catch(e) {}
  var isAuthorized = (activeUserEmail && activeUserEmail.toLowerCase() === "ezabulb@gmail.com");
  var verificationMenuLabel = isAuthorized ? "✉️ Verify Account Emails" : "✉️ Verify Account Emails (Locked by Reachoutly 🔒)";
  var verificationMenu = ui.createMenu(verificationMenuLabel);
  var totalDailyCredits = 0;

  ALL_TAB_NAMES.forEach(function(tabName) {
    var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + tabName);
    var creditLabel = "N/A";

    if (apiKey) {
      var balance = getCreditBalance(apiKey);
      if (balance) {
        var daily   = (balance.remaining_daily_credits   !== undefined) ? balance.remaining_daily_credits   : 0;
        var instant = (balance.remaining_instant_credits !== undefined) ? balance.remaining_instant_credits : 0;
        creditLabel = "D: " + daily + " | I: " + instant;
        totalDailyCredits += daily;
      }
    }
    var displayName = tabName.charAt(0).toUpperCase() + tabName.slice(1);
    verificationMenu.addItem(`Verify ${displayName} (${creditLabel})`, `verify${displayName}`);
  });
  menu.addSubMenu(verificationMenu);

  menu.addSeparator();

  // --- Section: Bulk Verification & Trigger Actions ---
  menu.addItem(`🚀 Lead List Clean  (Total D: ${totalDailyCredits})`, "cleanLeadList");
  menu.addItem("🔄 Check Pending Results", "checkPendingTaskResults");
  menu.addItem("🗑️ Clear All Pending Tasks", "clearAllPendingTasks");

  menu.addSeparator();

  // --- Section: Lead Filtering Tools ---
  menu.addItem("🧹 Clean Decision Makers", "cleanDecisionMakers");

  menu.addSeparator();

  // --- Section: Company Names Cleaner ---
  menu.addItem("🔄 Start Cleaning Company Names", "startCleaningProcess");
  menu.addItem("🧐 Check Cleaning Progress", "checkPendingProgress");
  menu.addItem("🗑️ Reset Cleaning Progress", "resetCleaningProgress");

  menu.addSeparator();

  // --- Section: Account Information & Setup Guidelines ---
  menu.addItem("🔃 Refresh & Show All Credits", "showAllCredits");
  menu.addItem("📖 Guideline / Help", "showGuideLine");

  menu.addToUi();
}

function showGuideLine() {
  var html = HtmlService
    .createHtmlOutputFromFile('GuidelineDialog')
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, '📖 Guideline & Help');
}

function cacheTaskId(tabName, taskId) {
  var cache = CacheService.getScriptCache();
  cache.put("taskId_" + tabName, taskId, 3600); // Cache for 1 hour
}

function scheduleStatusUpdateTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(t => t.getHandlerFunction() === "updateStatusForAllTabs");
  if (!exists) {
    ScriptApp.newTrigger("updateStatusForAllTabs")
      .timeBased()
      .everyMinutes(5)
      .create();
    Logger.log("Status update trigger created.");
  }
}

function updateStatusForAllTabs() {
  ALL_TAB_NAMES.forEach(function(tabName) {
    var cache = CacheService.getScriptCache();
    var taskId = cache.get("taskId_" + tabName);
    var apiKeyName = "API_KEY_" + tabName;
    var apiKey = PropertiesService.getScriptProperties().getProperty(apiKeyName);
    if (taskId && apiKey) {
      updateSheetWithTaskResult(tabName, taskId, apiKey);
    } else {
      Logger.log("No task ID or API key for tab: " + tabName);
    }
  });
}

/**
 * Polling handler: Updates a sheet tab with bulk verification task results.
 * Uses case-insensitive search for Email and Verification Status headers.
 */
function updateSheetWithTaskResult(tabName, taskId, apiKey) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    Logger.log("Sheet not found: " + tabName);
    return;
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailCol = -1;
  var statusCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
    if (h === "email") {
      emailCol = i + 1;
    }
    if (h === "verification status" || h === "status") {
      statusCol = i + 1;
    }
  }
  if (emailCol === -1 || statusCol === -1) return;
  
  var emailData = sheet.getRange(2, emailCol, sheet.getLastRow() - 1, 1).getValues().flat();
  var taskResultUrl = `https://emailverifier.reoon.com/api/v1/get-result-bulk-verification-task/?key=${encodeURIComponent(apiKey)}&task_id=${encodeURIComponent(taskId)}`;
  try {
    var taskResponse = UrlFetchApp.fetch(taskResultUrl, { muteHttpExceptions: true });
    var taskResult = JSON.parse(taskResponse.getContentText());
    if (taskResult.status !== "completed") {
      Logger.log("Task not completed yet: " + taskId);
      return;
    }
    if (taskResult.results && typeof taskResult.results === "object") {
      // Lowercase all keys in results to prevent case mismatches
      var resultsLower = {};
      Object.keys(taskResult.results).forEach(function(k) {
        resultsLower[k.toLowerCase()] = taskResult.results[k];
      });

      for (var i = 0; i < emailData.length; i++) {
        var email = emailData[i].toLowerCase();
        var result = resultsLower[email];
        if (result) {
          sheet.getRange(i + 2, statusCol).setValue(result.status || "Unknown");
        }
      }
      Logger.log("Updated verification results for tab: " + tabName);
      CacheService.getScriptCache().remove("taskId_" + tabName);
    } else {
      Logger.log("No valid results found for task: " + taskId);
    }
  } catch (e) {
    Logger.log("Error fetching task result for " + tabName + ": " + e.message);
  }
}

// ─── INDIVIDUAL VERIFY FUNCTIONS FOR ALL 7 ACCOUNTS ────────────────────────
function verifyEmailastrallc()  { verifyEmails("emailastrallc"); }
function verifyEmranhossain()   { verifyEmails("emranhossain"); }
function verifyAlimranshourov() { verifyEmails("alimranshourov"); }
function verifyAminsohel()      { verifyEmails("aminsohel"); }
function verifyAmin()           { verifyEmails("amin"); }
function verifySupport()        { verifyEmails("support"); }     // ← NEW
function verifyTool()           { verifyEmails("tool"); }        // ← NEW

// =============================================================================
//  INFO SHEET — Activity log for all users (used for misuse monitoring)
//  Columns: User Email | Function | Sheet | Task ID | API Account | Date | Task Name | Status | Total | Progress | Action
// =============================================================================
var INFO_SHEET_NAME = "info";
var INFO_HEADERS    = ["User Email", "Function", "Sheet", "Task ID", "API Account", "Date", "Task Name", "Status", "Total", "Progress", "Action"];

function createInfoSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INFO_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(INFO_SHEET_NAME, 0); // At first position
    Logger.log('"info" sheet created.');
  } else {
    // Check if headers need migration
    var currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    var hasApiAccount = currentHeaders.some(function(h) {
      return h && h.toString().toLowerCase().trim() === "api account";
    });
    if (!hasApiAccount) {
      Logger.log("API Account column missing from info sheet. Migrating...");
      var taskIdIdx = -1;
      for (var i = 0; i < currentHeaders.length; i++) {
        var h = currentHeaders[i] ? currentHeaders[i].toString().toLowerCase().trim() : "";
        if (h === "task id") {
          taskIdIdx = i;
          break;
        }
      }
      if (taskIdIdx !== -1) {
        // Insert column after Task ID (column number is taskIdIdx + 1)
        sheet.insertColumnAfter(taskIdIdx + 1);
        Logger.log("Inserted column after Task ID.");
      } else {
        // Fallback: insert at column 3
        sheet.insertColumnAfter(2);
        Logger.log("Task ID column not found. Inserted column at position 3.");
      }
    }
  }

  // Write/overwrite header row
  var headerRange = sheet.getRange(1, 1, 1, INFO_HEADERS.length);
  headerRange.setValues([INFO_HEADERS]);

  // Header styling
  headerRange
    .setBackground("#1a1a2e")
    .setFontColor("#e2e8f0")
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center");

  // Column widths
  sheet.setColumnWidth(1,  200); // User Email
  sheet.setColumnWidth(2,  160); // Function
  sheet.setColumnWidth(3,  160); // Sheet
  sheet.setColumnWidth(4,  160); // Task ID
  sheet.setColumnWidth(5,  140); // API Account
  sheet.setColumnWidth(6,  155); // Date
  sheet.setColumnWidth(7,  200); // Task Name
  sheet.setColumnWidth(8,  110); // Status
  sheet.setColumnWidth(9,   80); // Total
  sheet.setColumnWidth(10, 100); // Progress
  sheet.setColumnWidth(11, 130); // Action

  sheet.setFrozenRows(1);
  Logger.log('"info" sheet header setup completed.');

  // Apply protection so only admin can edit/delete
  protectInfoSheet(sheet);

  return sheet;
}

// ─── Log a task to info sheet ──────────────────────────────────────────
// logTaskToInfoSheet({ userEmail, fn, sheetName, taskId, taskName, apiAccount, status, total, progress, action })
function logTaskToInfoSheet(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INFO_SHEET_NAME);
  
  if (!sheet) {
    sheet = createInfoSheet();
  } else {
    // Migrate schema if needed (check header count matches current INFO_HEADERS)
    var currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (currentHeaders.length !== INFO_HEADERS.length) {
      sheet = createInfoSheet();
    }
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var userEmail = params.userEmail || getUserEmail() || "—";

  var rowValues = [];
  INFO_HEADERS.forEach(function(header) {
    if      (header === "User Email")  rowValues.push(userEmail);
    else if (header === "Function")    rowValues.push(params.fn || "—");
    else if (header === "Sheet")       rowValues.push(params.sheetName || "—");
    else if (header === "Task ID")     rowValues.push(params.taskId || "—");
    else if (header === "API Account") rowValues.push(params.apiAccount || "—");
    else if (header === "Date")        rowValues.push(now);
    else if (header === "Task Name")   rowValues.push(params.taskName || "—");
    else if (header === "Status")      rowValues.push(params.status || "submitted");
    else if (header === "Total")       rowValues.push(params.total || "");
    else if (header === "Progress")    rowValues.push(params.progress || "0%");
    else if (header === "Action")      rowValues.push(params.action || "pending");
  });

  sheet.appendRow(rowValues);
  Logger.log("Info log: " + userEmail + " | " + (params.fn || "—") + " | " + (params.taskId || "—") + " | " + params.status);
}

// ─── Log a one-off activity (no task ID) to info sheet ────────────────
// logActivityToInfoSheet({ fn, sheetName, status, total })
function logActivityToInfoSheet(params) {
  logTaskToInfoSheet({
    fn:        params.fn        || "—",
    sheetName: params.sheetName || "—",
    taskId:    "—",
    apiAccount: params.apiAccount || "—",
    taskName:  params.taskName  || params.fn || "—",
    status:    params.status    || "completed",
    total:     params.total     || "",
    progress:  "100%",
    action:    "done"
  });
}

// ─── Update a row in info sheet (find by Task ID) ──────────────────
function updateInfoSheetRow(taskId, updates) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INFO_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;

  var taskIdColIdx = INFO_HEADERS.indexOf("Task ID");     // 0-indexed
  var data         = sheet.getRange(2, 1, sheet.getLastRow() - 1, INFO_HEADERS.length).getValues();

  for (var r = 0; r < data.length; r++) {
    if (data[r][taskIdColIdx] === taskId) {
      var sheetRow = r + 2; // 1-indexed + header row
      Object.keys(updates).forEach(function(col) {
        var colIdx = INFO_HEADERS.indexOf(col);
        if (colIdx !== -1) {
          sheet.getRange(sheetRow, colIdx + 1).setValue(updates[col]);
        }
      });
      Logger.log("Info sheet updated: row " + sheetRow + " | taskId: " + taskId);
      return;
    }
  }
  Logger.log("Info sheet: taskId not found: " + taskId);
}

// ─── Protect info sheet — only admin can edit/delete ────────────────
// Uses Google Sheets native Protection API (enforced at Google level).
// Scripts (triggers) bypass this and can still write via appendRow/setValue.
var INFO_ADMIN_EMAIL = "ezabulb@gmail.com";

function protectInfoSheet(sheet) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!sheet) sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return;

    // Remove any existing protections on this sheet
    var existingProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    existingProtections.forEach(function(p) { p.remove(); });

    // Create new protection
    var protection = sheet.protect();
    protection.setDescription("Info tab — Read-only for all except admin (" + INFO_ADMIN_EMAIL + ")");

    // Remove domain editing if enabled
    if (protection.canDomainEdit()) {
      protection.setDomainEdit(false);
    }

    // Set editors: only admin + script owner (effective user who installed triggers)
    var allEditors = protection.getEditors().map(function(u) { return u.getEmail(); });
    allEditors.forEach(function(email) {
      try { protection.removeEditor(email); } catch(e) {}
    });
    protection.addEditor(INFO_ADMIN_EMAIL);            // Admin can edit
    protection.addEditor(Session.getEffectiveUser());  // Script owner can edit (needed for triggers)

    Logger.log("Info sheet protected. Only admin (" + INFO_ADMIN_EMAIL + ") can edit.");
  } catch(e) {
    Logger.log("protectInfoSheet error: " + e.message);
  }
}

// ─── ON OPEN ─────────────────────────────────────────────────────────────────
function onOpen() {
  createOrUpdateMenu();
  setupCreditRefreshTrigger();
  // Ensure the info tab exists, has correct headers, and is protected
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!infoSheet) {
      createInfoSheet(); // creates + protects
    } else {
      // Check if headers need migration
      var headers = infoSheet.getRange(1, 1, 1, Math.max(infoSheet.getLastColumn(), 1)).getValues()[0];
      var hasApiAccount = headers.some(function(h) {
        return h && h.toString().toLowerCase().trim() === "api account";
      });
      if (!hasApiAccount) {
        createInfoSheet(); // migrates + protects
      } else {
        // Re-apply protection on every open (in case it was removed manually)
        protectInfoSheet(infoSheet);
      }
    }
  } catch (e) {
    Logger.log("Error initializing info sheet on open: " + e.message);
  }
}


//----------------------------------------------------------------------------------------------


// =============================================================================
//  cleanDecisionMakers — Opens HTML popup dialog showing 3 options
// =============================================================================
function cleanDecisionMakers() {
  var html = HtmlService
    .createHtmlOutputFromFile('decision_maker')
    .setWidth(600)
    .setHeight(580);
  SpreadsheetApp.getUi().showModalDialog(html, '🧹 Clean Decision Makers');
}

// =============================================================================
//  runDecisionMakerFilter — Called from dialog, performs actual cleaning
//  filters = { keywords: [...], seniority: [...], industry: [...], departments: [...], country: [...], perCompany: N }
// =============================================================================
function runDecisionMakerFilter(filters) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet       = spreadsheet.getActiveSheet();
  var sheetName   = sheet.getName();
  var data        = sheet.getDataRange().getValues();

  if (data.length < 1) {
    throw new Error('No data found in active sheet.');
  }

  // ── Find Columns ────────────────────────────────────────────────────────
  var titleHeaders   = ["Title", "Job Title"];
  var companyHeaders = ["Company", "Company Name"];
  var statusHeaders  = ["Status", "Verification Status"];
  var industryHeaders = ["Industry", "Sector"];
  var countryHeaders = ["Country", "Location", "Nation"];
  
  var headers        = data[0];
  var titleCol = -1, companyCol = -1, statusCol = -1, industryCol = -1, countryCol = -1;

  for (var i = 0; i < headers.length; i++) {
    var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
    if (titleHeaders.some(function(x)   { return x.toLowerCase().trim() === h; })) titleCol   = i;
    if (companyHeaders.some(function(x) { return x.toLowerCase().trim() === h; })) companyCol = i;
    if (statusHeaders.some(function(x)  { return x.toLowerCase().trim() === h; })) statusCol  = i;
    if (industryHeaders.some(function(x) { return x.toLowerCase().trim() === h; })) industryCol = i;
    if (countryHeaders.some(function(x)  { return x.toLowerCase().trim() === h; })) countryCol  = i;
  }

  if (titleCol === -1 || companyCol === -1) {
    throw new Error('Required columns (Title/Job Title, Company/Company Name) not found.');
  }

  if (filters.industry && filters.industry.length > 0 && industryCol === -1) {
    throw new Error('An Industry filter was selected, but no "Industry" or "Sector" column was found in the sheet.');
  }

  if (filters.country && filters.country.length > 0 && countryCol === -1) {
    throw new Error('A Country filter was selected, but no "Country" or "Location" column was found in the sheet.');
  }

  var keywords = filters.keywords || [];
  // Fall back to default fixed list of titles if no keywords are specified in the UI
  if (keywords.length === 0) {
    keywords = [
      "Chief", "President", "VP", "Vice president", "SVP", "Head", "Director",
      "Founder", "Co-Founder", "Owner", "Co-Owner", "CEO", "Executive Director (ED)", "COO",
      "CFO", "CDO", "CPO", "CSO", "CMO", "CIO", "Chief Advocacy Officer (CAO)",
      "Chief Impact Officer (CIO)", "Chairperson of the Board", "Vice Chairperson", "Treasurer",
      "Secretary", "Board Member", "Program Director", "Program Manager"
    ];
  }
  var seniority = filters.seniority || [];
  var departments = filters.departments || [];
  var industries = filters.industry || [];
  var countries = filters.country || [];
  var maxPerCompany = filters.perCompany || 1;

  var keywordsLower = keywords.map(function(k) { return k.toLowerCase().trim(); });
  var seniorityLower = seniority.map(function(s) { return s.toLowerCase().trim(); });
  var departmentsLower = departments.map(function(d) { return d.toLowerCase().trim(); });
  var industriesLower = industries.map(function(ind) { return ind.toLowerCase().trim(); });
  var countriesLower = countries.map(function(c) { return c.toLowerCase().trim(); });

  var statusPriority = ["safe", "role_account", "catch_all", "disposable"];
  var hasStatus = (statusCol !== -1);

  // ── Data filter ──────────────────────────────────────────────────────────
  var companyMap   = {};
  var totalScanned = 0;
  var totalMatched = 0;

  for (var r = 1; r < data.length; r++) {
    var row     = data[r];
    var company = row[companyCol] ? row[companyCol].toString().trim() : "";
    if (!company) continue;

    totalScanned++;

    var rowTitle = row[titleCol] ? row[titleCol].toString().toLowerCase().trim() : "";

    // 1. Industry Filter
    if (industriesLower.length > 0) {
      var rowIndustry = row[industryCol] ? row[industryCol].toString().toLowerCase().trim() : "";
      var matchIndustry = industriesLower.some(function(ind) {
        return rowIndustry === ind || rowIndustry.indexOf(ind) !== -1;
      });
      if (!matchIndustry) continue;
    }

    // 2. Country Filter
    if (countriesLower.length > 0) {
      var rowCountry = row[countryCol] ? row[countryCol].toString().toLowerCase().trim() : "";
      var matchCountry = countriesLower.some(function(c) {
        return rowCountry === c || rowCountry.indexOf(c) !== -1;
      });
      if (!matchCountry) continue;
    }

    // 3. Keyword Filter
    if (keywordsLower.length > 0) {
      var matchKeyword = keywordsLower.some(function(k) {
        return rowTitle.indexOf(k) !== -1;
      });
      if (!matchKeyword) continue;
    }

    // 4. Seniority Filter
    if (seniorityLower.length > 0) {
      var matchSeniority = seniorityLower.some(function(s) {
        if (s === "c-suite") {
          return rowTitle.indexOf("chief") !== -1 || rowTitle.indexOf("ceo") !== -1 || rowTitle.indexOf("cto") !== -1 || rowTitle.indexOf("cfo") !== -1 || rowTitle.indexOf("coo") !== -1;
        }
        return rowTitle.indexOf(s) !== -1;
      });
      if (!matchSeniority) continue;
    }

    // 5. Departments Filter
    if (departmentsLower.length > 0) {
      var matchDept = departmentsLower.some(function(d) {
        return matchesSubDepartment(rowTitle, d);
      });
      if (!matchDept) continue;
    }

    // Check verification status rank
    var status = hasStatus && row[statusCol] ? row[statusCol].toString().trim().toLowerCase() : "";
    var matchesStatus = !hasStatus || statusPriority.indexOf(status) !== -1 || status === "";
    
    if (matchesStatus) {
      totalMatched++;
      if (!companyMap[company]) companyMap[company] = [];
      var rank = hasStatus ? statusPriority.indexOf(status) : 0;
      if (rank === -1) {
        rank = 999;
      }
      companyMap[company].push({ row: row, statusRank: rank, index: r });
    }
  }

  // ── Sort and limit per company ───────────────────────────────────────────
  var cleanedData = [headers];
  var totalKept   = 0;

  Object.keys(companyMap).forEach(function(company) {
    companyMap[company].sort(function(a, b) {
      if (a.statusRank !== b.statusRank) {
        return a.statusRank - b.statusRank;
      }
      return a.index - b.index; // preserve original order
    });
    var limit = Math.min(companyMap[company].length, maxPerCompany);
    for (var i = 0; i < limit; i++) {
      cleanedData.push(companyMap[company][i].row);
      totalKept++;
    }
  });

  // ── Write to new sheet ───────────────────────────────────────────────────
  var cleanedSheetName = "Cleaned — " + sheetName;
  var cleanedSheet     = spreadsheet.getSheetByName(cleanedSheetName);
  if (cleanedSheet) {
    cleanedSheet.clear();
  } else {
    cleanedSheet = spreadsheet.insertSheet(cleanedSheetName);
  }
  cleanedSheet.getRange(1, 1, cleanedData.length, cleanedData[0].length).setValues(cleanedData);

  // Style sheet
  cleanedSheet.getRange(1, 1, 1, cleanedData[0].length).setFontWeight("bold");
  try {
    cleanedSheet.autoResizeColumns(1, cleanedData[0].length);
  } catch(e) {
    Logger.log("Auto resize failed: " + e.message);
  }
  
  // Activate cleaned sheet
  cleanedSheet.activate();

  // ── Log activity to info sheet ───────────────────────────────────────────
  try {
    logActivityToInfoSheet({
      fn:        "Decision Maker Filter",
      sheetName: sheetName,
      taskName:  "Decision Maker — " + sheetName,
      status:    "completed",
      total:     totalKept
    });
  } catch(e) { Logger.log("Info log error (runDecisionMakerFilter): " + e.message); }

  // ── Return summary (displayed in dialog) ────────────────────────────────
  return [
    "✅ Clean Decision Makers — Completed",
    "══════════════════════════════════════",
    "📂 Scanned    : " + totalScanned + " row(s)",
    "✅ Matched    : " + totalMatched + " decision maker(s)",
    "📊 Final Kept : " + totalKept + " row(s) (max " + maxPerCompany + " per company)",
    "🗂  Output Tab : \"" + cleanedSheetName + "\"",
    "📢 Status Col : " + (hasStatus ? "Active (" + headers[statusCol] + ")" : "Not Found (Skipped)")
  ].join("\n");
}

/**
 * Counts matching leads dynamically based on active filters in the dashboard.
 */
function countDecisionMakerLeads(filters) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet       = spreadsheet.getActiveSheet();
    var data        = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;

    var headers = data[0];
    var titleCol = -1, companyCol = -1, industryCol = -1, countryCol = -1;
    
    var titleHeaders   = ["Title", "Job Title"];
    var companyHeaders = ["Company", "Company Name"];
    var industryHeaders = ["Industry", "Sector"];
    var countryHeaders = ["Country", "Location", "Nation"];

    for (var i = 0; i < headers.length; i++) {
      var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
      if (titleHeaders.some(function(x)   { return x.toLowerCase().trim() === h; })) titleCol   = i;
      if (companyHeaders.some(function(x) { return x.toLowerCase().trim() === h; })) companyCol = i;
      if (industryHeaders.some(function(x) { return x.toLowerCase().trim() === h; })) industryCol = i;
      if (countryHeaders.some(function(x)  { return x.toLowerCase().trim() === h; })) countryCol  = i;
    }

    if (titleCol === -1 || companyCol === -1) return 0;

    var keywords = filters.keywords || [];
    // Fall back to default fixed list of titles if no keywords are specified in the UI
    if (keywords.length === 0) {
      keywords = [
        "Chief", "President", "VP", "Vice president", "SVP", "Head", "Director",
        "Founder", "Co-Founder", "Owner", "Co-Owner", "CEO", "Executive Director (ED)", "COO",
        "CFO", "CDO", "CPO", "CSO", "CMO", "CIO", "Chief Advocacy Officer (CAO)",
        "Chief Impact Officer (CIO)", "Chairperson of the Board", "Vice Chairperson", "Treasurer",
        "Secretary", "Board Member", "Program Director", "Program Manager"
      ];
    }
    var seniority = filters.seniority || [];
    var departments = filters.departments || [];
    var industries = filters.industry || [];
    var countries = filters.country || [];

    var keywordsLower = keywords.map(function(k) { return k.toLowerCase().trim(); });
    var seniorityLower = seniority.map(function(s) { return s.toLowerCase().trim(); });
    var departmentsLower = departments.map(function(d) { return d.toLowerCase().trim(); });
    var industriesLower = industries.map(function(ind) { return ind.toLowerCase().trim(); });
    var countriesLower = countries.map(function(c) { return c.toLowerCase().trim(); });

    var count = 0;

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var company = row[companyCol] ? row[companyCol].toString().trim() : "";
      if (!company) continue;

      var rowTitle = row[titleCol] ? row[titleCol].toString().toLowerCase().trim() : "";

      // 1. Industry Filter
      if (industriesLower.length > 0) {
        if (industryCol === -1) continue;
        var rowIndustry = row[industryCol] ? row[industryCol].toString().toLowerCase().trim() : "";
        var matchIndustry = industriesLower.some(function(ind) {
          return rowIndustry === ind || rowIndustry.indexOf(ind) !== -1;
        });
        if (!matchIndustry) continue;
      }

      // 2. Country Filter
      if (countriesLower.length > 0) {
        if (countryCol === -1) continue;
        var rowCountry = row[countryCol] ? row[countryCol].toString().toLowerCase().trim() : "";
        var matchCountry = countriesLower.some(function(c) {
          return rowCountry === c || rowCountry.indexOf(c) !== -1;
        });
        if (!matchCountry) continue;
      }

      // 3. Keyword Filter
      if (keywordsLower.length > 0) {
        var matchKeyword = keywordsLower.some(function(k) {
          return rowTitle.indexOf(k) !== -1;
        });
        if (!matchKeyword) continue;
      }

      // 4. Seniority Filter
      if (seniorityLower.length > 0) {
        var matchSeniority = seniorityLower.some(function(s) {
          if (s === "c-suite") {
            return rowTitle.indexOf("chief") !== -1 || rowTitle.indexOf("ceo") !== -1 || rowTitle.indexOf("cto") !== -1 || rowTitle.indexOf("cfo") !== -1 || rowTitle.indexOf("coo") !== -1;
          }
          return rowTitle.indexOf(s) !== -1;
        });
        if (!matchSeniority) continue;
      }

      // 5. Departments Filter
      if (departmentsLower.length > 0) {
        var matchDept = departmentsLower.some(function(d) {
          return matchesSubDepartment(rowTitle, d);
        });
        if (!matchDept) continue;
      }

      count++;
    }

    return count;
  } catch (e) {
    Logger.log("Error counting leads: " + e.message);
    return 0;
  }
}

/**
 * Matches titles against sub-department keywords.
 */
function matchesSubDepartment(title, subDept) {
  var t = title.toLowerCase();
  var s = subDept.toLowerCase();
  
  if (s === "software development") {
    return t.indexOf("software") !== -1 || t.indexOf("developer") !== -1 || t.indexOf("programmer") !== -1 || t.indexOf("engineer") !== -1;
  }
  if (s === "c-suite" || s === "executive") {
    return t.indexOf("chief") !== -1 || t.indexOf("c-suite") !== -1 || t.indexOf("executive") !== -1 || t.indexOf("ceo") !== -1 || t.indexOf("cto") !== -1 || t.indexOf("cfo") !== -1 || t.indexOf("coo") !== -1;
  }
  
  var words = s.split(/\s+/);
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length > 3 && t.indexOf(w) !== -1) {
      return true;
    }
  }
  return t.indexOf(s) !== -1;
}

/**
 * Robust helper to retrieve the email of the active user.
 * Falls back to querying Google's UserInfo OAuth API if getActiveUser().getEmail() is blank (e.g. for external users/collaborators).
 */
function getUserEmail() {
  var email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch(e) {
    Logger.log("Error getting active user email via Session: " + e.message);
  }
  
  if (!email || email === "") {
    try {
      var token = ScriptApp.getOAuthToken();
      var response = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          "Authorization": "Bearer " + token
        },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        var profile = JSON.parse(response.getContentText());
        email = profile.email || "";
      } else {
        Logger.log("OAuth userinfo failed with code " + response.getResponseCode() + ": " + response.getContentText());
      }
    } catch(e) {
      Logger.log("Error getting email via OAuth: " + e.message);
    }
  }
  
  return email;
}


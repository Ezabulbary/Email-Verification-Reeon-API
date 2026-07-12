// =============================================================================
//  LeadListCleaner.gs  — STABLE MODE (v3)
//
//  ✅ Fix 1: emails[] array is no longer stored in PropertiesService
//            → Only lightweight task metadata is stored (tiny size)
//            → Scans sheet for "Pending..." rows to find and write task results
//
//  ✅ Fix 2: Gracefully stops 10 seconds before the 6-minute GAS execution limit
//
//  ✅ Fix 3: Task metadata is stored and trigger is started immediately upon submission
//            → Task IDs are preserved even if the script crashes midway
//
//  Speed Strategy:
//   ① Task submit → instantly saved in PropertiesService (tiny metadata only)
//   ② Polls every 10 seconds (max 350s = 6min - 10s)
//   ③ Fallbacks to a 1-minute background trigger if time limit is exceeded
// =============================================================================

// ─── Config ──────────────────────────────────────────────────────────────────
var LLC_ACCOUNTS       = ["emailastrallc", "emranhossain", "alimranshourov", "aminsohel", "amin", "support", "tool"];
var LLC_API_BASE       = "https://emailverifier.reoon.com/api/v1";
var LLC_PENDING_STATUS = "Pending...";
var LLC_TASKS_PROP_KEY = "LLC_PENDING_TASKS";

var LLC_POLL_INTERVAL_MS   = 10 * 1000;   // Poll every 10 seconds
var LLC_SCRIPT_DEADLINE_MS = 100 * 1000;  // 100 seconds max in-script polling (prevents timeout)
var LLC_TRIGGER_MINUTES    = 1;           // Background Trigger: every 1 minute

// =============================================================================
//  MAIN FUNCTION — "🚀 Lead List Clean" Button
// =============================================================================
function cleanLeadList() {
  var SCRIPT_START = new Date().getTime();
  var ui           = SpreadsheetApp.getUi();
  var spreadsheet  = SpreadsheetApp.getActiveSpreadsheet();
  var sheet        = spreadsheet.getActiveSheet();
  var sheetName    = sheet.getName();

  // ── 1. Find Columns ──────────────────────────────────────────────────────
  var headers      = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailColIdx  = -1;
  var statusColIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
    if (h === "email") {
      emailColIdx = i;
    }
    if (h === "verification status" || h === "status") {
      statusColIdx = i;
    }
  }

  if (emailColIdx === -1) {
    ui.alert('❌ "Email" column not found.');
    return;
  }
  if (statusColIdx === -1) {
    sheet.insertColumnAfter(emailColIdx + 1);
    statusColIdx = emailColIdx + 1;
    sheet.getRange(1, statusColIdx + 1).setValue("Verification Status");
  }

  // Find or create Verification Date column (always right after Verification Status)
  var freshHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dateColIdx = -1;
  for (var i = 0; i < freshHeaders.length; i++) {
    var fh = freshHeaders[i] ? freshHeaders[i].toString().toLowerCase().trim() : "";
    if (fh === "verification date") {
      dateColIdx = i;
    }
  }
  if (dateColIdx === -1) {
    sheet.insertColumnAfter(statusColIdx + 1);
    dateColIdx = statusColIdx + 1;
    sheet.getRange(1, dateColIdx + 1).setValue("Verification Date");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { ui.alert("❌ No data found in sheet."); return; }

  // ── 2. Read Email & Status together (single API call) ──────────────────────
  var dataRange  = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var pendingEmails = [];

  for (var i = 0; i < dataRange.length; i++) {
    var em = (dataRange[i][emailColIdx]  || "").toString().trim();
    var st = (dataRange[i][statusColIdx] || "").toString().trim();
    if (em && llcIsValidEmail(em) && st === "") {
      pendingEmails.push({ email: em, rowIndex: i + 2 });
    }
  }

  var totalUnprocessed = pendingEmails.length;
  if (totalUnprocessed === 0) {
    var existing = llcGetStoredTasks();
    var msg = "✅ All emails are already processed!";
    if (existing.length > 0) msg += "\n\n⏳ " + existing.length + " task(s) running in background.";
    ui.alert(msg);
    return;
  }

  // ── 3. Check Daily Credits (sequential, not parallel) ──────────────────────
  var accountCredits = [];
  var totalCredits   = 0;

  LLC_ACCOUNTS.forEach(function(account) {
    var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + account);
    if (!apiKey) { Logger.log(account + ": API key not found"); return; }
    var daily = llcGetDailyCredits(apiKey);
    if (daily && daily > 0) {
      accountCredits.push({ account: account, apiKey: apiKey, dailyCredits: daily });
      totalCredits += daily;
      Logger.log(account + " Daily: " + daily);
    }
  });

  if (totalCredits === 0) {
    ui.alert("❌ All accounts have exhausted their Daily Credits.\nPlease try again tomorrow.");
    return;
  }

  // ── 4. Split emails among accounts ─────────────────────────────────────
  var emailsToProcess = pendingEmails.slice(0, totalCredits);
  var remaining       = totalUnprocessed - emailsToProcess.length;
  var batches         = [];
  var cursor          = 0;

  accountCredits.forEach(function(ac) {
    if (cursor >= emailsToProcess.length) return;
    var slice = emailsToProcess.slice(cursor, cursor + ac.dailyCredits);
    cursor += slice.length;
    if (slice.length > 0) batches.push({ account: ac.account, apiKey: ac.apiKey, emails: slice });
  });

  // ── 5. Create Bulk Tasks ────────────────────────────────────────────────
  var successTasks = []; // lightweight metadata only
  var failBatches  = [];

  batches.forEach(function(batch) {
    var emailList = batch.emails.map(function(e) { return e.email.toLowerCase().trim(); });
    var taskName  = batch.account + "_" + sheetName;
    var result    = llcCreateBulkTask(batch.apiKey, taskName, emailList);

    if (result && result.task_id) {
      // Write "Pending..." (batch write in single range call)
      var minRow  = batch.emails[0].rowIndex;
      var maxRow  = batch.emails[batch.emails.length - 1].rowIndex;

      // Read all rows together
      var rangeVals = sheet.getRange(minRow, statusColIdx + 1, maxRow - minRow + 1, 1).getValues();
      batch.emails.forEach(function(e) {
        rangeVals[e.rowIndex - minRow][0] = LLC_PENDING_STATUS;
      });
      sheet.getRange(minRow, statusColIdx + 1, maxRow - minRow + 1, 1).setValues(rangeVals);

      // ✅ Lightweight metadata - no emails[] array!
      var taskMeta = {
        account:   batch.account,
        apiKey:    batch.apiKey,
        taskId:    result.task_id,
        sheetName: sheetName,
        statusCol: statusColIdx + 1,  // 1-indexed
        emailCol:  emailColIdx  + 1,  // 1-indexed
        dateCol:   dateColIdx   + 1   // 1-indexed
      };
      successTasks.push(taskMeta);
      Logger.log(batch.account + " ✅ Task: " + result.task_id + " (" + emailList.length + " emails)");

      // Log to info sheet
      try {
        logTaskToInfoSheet({
          fn:         "Lead List Clean",
          sheetName:  sheetName,
          taskId:     result.task_id,
          taskName:   taskName,
          apiAccount: batch.account,
          status:     "submitted",
          total:      emailList.length,
          progress:   "0%",
          action:     "polling"
        });
      } catch(e) { Logger.log("Info log error: " + e.message); }

    } else {
      failBatches.push(batch.account);
      Logger.log(batch.account + " ❌ Task creation failed");
    }
  });

  if (successTasks.length === 0) {
    ui.alert("❌ No tasks could be created.\nFailed accounts: " + failBatches.join(", "));
    return;
  }

  // ── 6. ✅ Store and trigger immediately - crash safe ───────────────────
  llcStoreTasks(successTasks);
  llcScheduleResultTrigger();
  Logger.log(successTasks.length + " task(s) stored. Trigger active.");

  // ── 7. Aggressive In-Script Polling ──────────────────────────────────────
  var stillPending = llcAggressivePoll(successTasks, sheet, SCRIPT_START);

  // ── 8. Update storage after polling ───────────────────────────────────
  if (stillPending.length > 0) {
    llcStoreTasks(stillPending);
    Logger.log(stillPending.length + " task(s) kept in trigger.");
  } else {
    llcDeleteResultTrigger();
    llcStoreTasks([]);
    Logger.log("All tasks completed. Trigger removed.");
  }

  // ── 9. Summary ────────────────────────────────────────────────────────────
  var completedCount = successTasks.length - stillPending.length;
  var lines = [
    "📊 Lead List Clean — Summary",
    "══════════════════════════════════",
    "📤 Total Submitted : " + emailsToProcess.length + " emails (Daily Credits Only)",
    "✅ Completed Tasks : " + completedCount + " task(s) (Sheet updated)",
    "⏳ In Progress Tasks: " + stillPending.length + " task(s) (In trigger)",
    "🔁 Remaining Leads : " + remaining + " email(s) (Will process in next run)",
    "",
    "📋 Detailed Accounts Usage:",
    "──────────────────────────────────"
  ];
  successTasks.forEach(function(t) {
    var isDone = !stillPending.some(function(p) { return p.taskId === t.taskId; });
    var leadCount = 0;
    var batch = batches.find(function(b) { return b.account === t.account; });
    if (batch) {
      leadCount = batch.emails.length;
    }
    var statusText = isDone ? "✅ Completed" : "⏳ In Progress";
    lines.push("  • " + t.account + ": " + leadCount + " leads | Status: " + statusText + " | Task ID: " + t.taskId);
  });
  if (failBatches.length > 0) {
    lines.push("");
    lines.push("  ❌ Failed Accounts: " + failBatches.join(", "));
  }
  if (stillPending.length > 0) {
    lines.push("");
    lines.push("⚡ Background trigger is checking progress every 1 minute.");
  }
  if (remaining > 0) {
    lines.push("▶ Remaining " + remaining + " leads will be cleaned in the next run.");
  }

  ui.alert(lines.join("\n"));
}

// =============================================================================
//  AGGRESSIVE IN-SCRIPT POLLING
//  Polls every 10 seconds from script start until 350s.
//  Scans sheet for "Pending..." rows to write results for completed tasks.
// =============================================================================
function llcAggressivePoll(tasks, sheet, scriptStartTime) {
  var pending     = tasks.slice();
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var deadline    = scriptStartTime + LLC_SCRIPT_DEADLINE_MS;

  Logger.log("⚡ Polling started. Tasks: " + pending.length + ", Deadline: " + LLC_SCRIPT_DEADLINE_MS / 1000 + "s");

  while (pending.length > 0) {
    var now       = new Date().getTime();
    var remaining = deadline - now;

    if (remaining <= 0) {
      Logger.log("⏱ Deadline! " + pending.length + " tasks → Trigger. (" + Math.round((now - scriptStartTime) / 1000) + "s elapsed)");
      break;
    }

    // Stop if there is no time for next poll + 5s buffer
    if (remaining < LLC_POLL_INTERVAL_MS + 5000) {
      Logger.log("⏱ Out of time (" + Math.round(remaining / 1000) + "s remaining) → Trigger.");
      break;
    }

    Utilities.sleep(LLC_POLL_INTERVAL_MS);

    var stillPending = [];
    pending.forEach(function(task) {
      var result = llcFetchTaskResult(task.apiKey, task.taskId);
      if (!result)                           { stillPending.push(task); return; }
      if (result.status !== "completed")     { stillPending.push(task); return; }
      if (!result.results)                   { stillPending.push(task); return; }

      // ✅ Complete - scan sheet and write results
      var written = llcWriteResultsToSheet(task, result.results, spreadsheet);
      Logger.log("✅ " + task.taskId + " done. " + written + " rows written.");

      try {
        updateInfoSheetRow(task.taskId, { "Status": "completed", "Progress": "100%", "Action": "done" });
        SpreadsheetApp.flush();
      } catch(e) { Logger.log("updateInfoSheetRow error (poll): " + e.message); }
    });

    pending = stillPending;
    Logger.log("Poll cycle. Pending: " + pending.length + " | " + Math.round((new Date().getTime() - scriptStartTime) / 1000) + "s elapsed");
  }

  return pending;
}

// =============================================================================
//  BACKGROUND TRIGGER HANDLER (Runs every 1 minute)
// =============================================================================
function checkPendingTaskResults() {
  var CHECK_START = new Date().getTime();
  var CHECK_DEADLINE_MS = 5.5 * 60 * 1000; // 5.5 minutes — safe GAS limit is 6 min

  var storedTasks = llcGetStoredTasks();
  var recoveredTasks = llcRecoverLostTasks();

  // Merge stored and recovered tasks by taskId to prevent duplicates
  var taskMap = {};
  storedTasks.forEach(function(t) { taskMap[t.taskId] = t; });
  recoveredTasks.forEach(function(t) { taskMap[t.taskId] = t; });

  var tasks = [];
  Object.keys(taskMap).forEach(function(id) {
    tasks.push(taskMap[id]);
  });

  // Recovery: No stored or recovered tasks but "Pending..." rows exist in sheet?
  if (tasks.length === 0) {
    llcDeleteResultTrigger();
    Logger.log("No stored or recovered tasks found.");

    try {
      var ss      = SpreadsheetApp.getActiveSpreadsheet();
      var sheet   = ss.getActiveSheet();
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var stCol   = -1;
      for (var i = 0; i < headers.length; i++) {
        var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
        if (h === "verification status" || h === "status") {
          stCol = i;
          break;
        }
      }
      var orphanCount = 0;

      if (stCol !== -1 && sheet.getLastRow() > 1) {
        var statusData = sheet.getRange(2, stCol + 1, sheet.getLastRow() - 1, 1).getValues().flat();
        orphanCount = statusData.filter(function(s) { return s === LLC_PENDING_STATUS; }).length;
      }

      if (orphanCount > 0) {
        var ui   = SpreadsheetApp.getUi();
        var resp = ui.alert(
          "⚠️ Pending Rows Found",
          orphanCount + " row(s) have \"Pending...\" status but no active Task ID.\n\n" +
          "Clearing them will allow them to be processed again in the next run.\nDo you want to clear them?",
          ui.ButtonSet.YES_NO
        );
        if (resp === ui.Button.YES) {
          var statusRange = sheet.getRange(2, stCol + 1, sheet.getLastRow() - 1, 1);
          var vals        = statusRange.getValues();
          for (var i = 0; i < vals.length; i++) {
            if (vals[i][0] === LLC_PENDING_STATUS) vals[i][0] = "";
          }
          statusRange.setValues(vals);
          ui.alert("✅ " + orphanCount + " row(s) cleared.\nRun \"Lead List Clean\" now.");
        }
      } else {
        try { SpreadsheetApp.getUi().alert("✅ No Pending Tasks found."); } catch(e) {}
      }
    } catch(e) { Logger.log("Recovery error: " + e.message); }
    return;
  }

  // ── Process stored and recovered tasks ────────────────────────────────────
  var spreadsheet    = SpreadsheetApp.getActiveSpreadsheet();
  var remainingTasks = [];
  var totalWritten   = 0;
  var timedOut       = false;

  tasks.forEach(function(task) {
    // ⏱ Execution time guard — stop processing if near 6-min GAS limit
    if (new Date().getTime() - CHECK_START > CHECK_DEADLINE_MS) {
      Logger.log("⏱ Time limit reached in checkPendingTaskResults. Deferring remaining tasks to trigger.");
      timedOut = true;
      remainingTasks.push(task);
      return;
    }

    if (timedOut) { remainingTasks.push(task); return; }

    var result = llcFetchTaskResult(task.apiKey, task.taskId);
    if (!result || result.status !== "completed" || !result.results) {
      remainingTasks.push(task);
      Logger.log("Task " + task.taskId + " is still " + (result ? result.status : "fetch failed"));
      return;
    }

    var written = llcWriteResultsToSheet(task, result.results, spreadsheet);
    totalWritten += written;
    Logger.log("✅ " + task.taskId + " done. " + written + " written.");

    try {
      updateInfoSheetRow(task.taskId, { "Status": "completed", "Progress": "100%", "Action": "done" });
      SpreadsheetApp.flush();
    } catch(e) { Logger.log("updateInfoSheetRow error (checkPending): " + e.message); }
  });

  llcStoreTasks(remainingTasks);
  if (remainingTasks.length === 0) {
    llcDeleteResultTrigger();
    Logger.log("🎉 All tasks completed. Trigger removed.");
  }

  try {
    var msg = "✅ " + totalWritten + " Email Result(s) written.";
    if (remainingTasks.length > 0) msg += "\n⏳ " + remainingTasks.length + " task(s) still running.";
    else msg += "\n🎉 All tasks completed!";
    SpreadsheetApp.getUi().alert(msg);
  } catch(e) { /* No UI in trigger context */ }
}

// =============================================================================
//  llcRecoverLostTasks — Scans tabs for "Pending..." rows and searches info tab
//  for corresponding active task IDs to reconstruct the metadata.
// =============================================================================
function llcRecoverLostTasks() {
  var recoveredTasks = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Find info sheet first
  var infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
  if (!infoSheet || infoSheet.getLastRow() < 2) {
    return recoveredTasks;
  }
  
  var lastRowInfo = infoSheet.getLastRow();
  var infoData = infoSheet.getRange(2, 1, lastRowInfo - 1, INFO_HEADERS.length).getValues();
  
  var taskIdColIdx = INFO_HEADERS.indexOf("Task ID");
  var taskNameColIdx = INFO_HEADERS.indexOf("Task Name");
  var statusColIdx = INFO_HEADERS.indexOf("Status");
  
  var sheets = ss.getSheets();
  sheets.forEach(function(sheet) {
    var sheetName = sheet.getName();
    if (sheetName === INFO_SHEET_NAME) return;
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    
    // Find Email and Verification Status columns
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var emailColIdx = -1;
    var statusColIdxSheet = -1;
    var dateColIdxSheet = -1;
    
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i] ? headers[i].toString().toLowerCase().trim() : "";
      if (h === "email") {
        emailColIdx = i;
      }
      if (h === "verification status" || h === "status") {
        statusColIdxSheet = i;
      }
      if (h === "verification date") {
        dateColIdxSheet = i;
      }
    }
    
    if (emailColIdx === -1 || statusColIdxSheet === -1) return;
    
    // Check if there are any "Pending..." rows in the Verification Status column
    var statusValues = sheet.getRange(2, statusColIdxSheet + 1, lastRow - 1, 1).getValues().flat();
    var hasPending = statusValues.some(function(s) {
      return s && s.toString().trim() === LLC_PENDING_STATUS;
    });
    
    if (!hasPending) return;
    
    // Look up infoSheet rows for active tasks related to this sheetName
    infoData.forEach(function(row) {
      var taskId = row[taskIdColIdx] ? row[taskIdColIdx].toString().trim() : "";
      var taskName = row[taskNameColIdx] ? row[taskNameColIdx].toString().trim() : "";
      var status = row[statusColIdx] ? row[statusColIdx].toString().trim().toLowerCase() : "";
      
      if (!taskId || taskId === "—" || status === "completed" || status === "done") return;
      
      // taskName format: accountName + "_" + sheetName
      LLC_ACCOUNTS.forEach(function(account) {
        var prefix = account + "_";
        if (taskName.indexOf(prefix) === 0) {
          var matchedSheetName = taskName.substring(prefix.length);
          if (matchedSheetName === sheetName) {
            var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY_" + account);
            if (apiKey) {
              recoveredTasks.push({
                account: account,
                apiKey: apiKey,
                taskId: taskId,
                sheetName: sheetName,
                statusCol: statusColIdxSheet + 1,                              // 1-indexed
                emailCol:  emailColIdx + 1,                                    // 1-indexed
                dateCol:   dateColIdxSheet !== -1 ? dateColIdxSheet + 1 : null // 1-indexed
              });
              Logger.log("Recovered task metadata from info sheet. ID: " + taskId + ", Account: " + account + ", Sheet: " + sheetName);
            }
          }
        }
      });
    });
  });
  
  return recoveredTasks;
}

// =============================================================================
//  CORE: Scan sheet and write results to "Pending..." rows
//  No emails[] array stored - avoids PropertiesService size limit issues
// =============================================================================
function llcWriteResultsToSheet(task, resultObj, spreadsheet) {
  var ss      = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(task.sheetName);
  if (!sheet) { Logger.log("Sheet not found: " + task.sheetName); return 0; }

  var lastRow   = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var numRows   = lastRow - 1;
  var emailColI = task.emailCol  - 1; // 0-indexed
  var statColI  = task.statusCol - 1; // 0-indexed

  // Read all sheet data at once (single API call)
  var numCols   = Math.max(task.emailCol, task.statusCol);
  var allData   = sheet.getRange(2, 1, numRows, numCols).getValues();

  // Get current status column values to avoid overwriting unrelated rows
  var statusRange  = sheet.getRange(2, task.statusCol, numRows, 1);
  var statusValues = statusRange.getValues();

  // Date column setup (if available)
  var dateRange  = null;
  var dateValues = null;
  if (task.dateCol) {
    dateRange  = sheet.getRange(2, task.dateCol, numRows, 1);
    dateValues = dateRange.getValues();
  }
  var today = new Date();

  var written   = 0;

  // Lowercase all keys in resultObj to prevent case mismatches
  var resultObjLower = {};
  if (resultObj) {
    Object.keys(resultObj).forEach(function(key) {
      resultObjLower[key.toLowerCase()] = resultObj[key];
    });
  }

  for (var r = 0; r < allData.length; r++) {
    if (allData[r][statColI] !== LLC_PENDING_STATUS) continue; // Process only Pending... rows

    var email  = (allData[r][emailColI] || "").toString().trim().toLowerCase();
    if (!email) continue;

    var res    = resultObjLower[email];
    if (res) {
      var status = res.status || "unknown";
      statusValues[r][0] = status;
      if (dateValues) dateValues[r][0] = today; // Write verification date
      written++;
    }
  }

  // Write the entire updated status & date columns back in single API calls
  if (written > 0) {
    statusRange.setValues(statusValues);
    if (dateRange && dateValues) {
      dateRange.setValues(dateValues);
    }
  }

  return written;
}

// =============================================================================
//  API HELPERS
// =============================================================================

function llcGetDailyCredits(apiKey) {
  var url = LLC_API_BASE + "/check-account-balance/?key=" + encodeURIComponent(apiKey);
  try {
    var resp   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var result = JSON.parse(resp.getContentText());
    Logger.log("Credit [" + resp.getResponseCode() + "]: " + JSON.stringify(result));
    if (resp.getResponseCode() === 200) {
      return result.remaining_daily_credits || 0;
    }
    return null;
  } catch(e) { Logger.log("Credit error: " + e.message); return null; }
}

function llcCreateBulkTask(apiKey, taskName, emailList) {
  var url  = LLC_API_BASE + "/create-bulk-verification-task/";
  var opts = {
    method:             "post",
    contentType:        "application/json",
    payload:            JSON.stringify({ name: "Lead Clean: " + taskName, emails: emailList, key: apiKey }),
    muteHttpExceptions: true
  };
  try {
    var resp   = UrlFetchApp.fetch(url, opts);
    var result = JSON.parse(resp.getContentText());
    Logger.log("createTask [" + resp.getResponseCode() + "]: " + result.task_id);
    return (resp.getResponseCode() === 201 && result.task_id) ? result : null;
  } catch(e) { Logger.log("createTask error: " + e.message); return null; }
}

function llcFetchTaskResult(apiKey, taskId) {
  var url = LLC_API_BASE + "/get-result-bulk-verification-task/?key=" + encodeURIComponent(apiKey) + "&task_id=" + encodeURIComponent(taskId);
  try {
    var resp   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var result = JSON.parse(resp.getContentText());
    return (resp.getResponseCode() === 200) ? result : null;
  } catch(e) { Logger.log("fetchResult error: " + e.message); return null; }
}

function llcIsValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// =============================================================================
//  TASK STORAGE - Lightweight metadata only (NO emails[] array)
//  Stored format per task:
//  { account, apiKey, taskId, sheetName, statusCol, emailCol }
//  Max size ≈ 7 tasks × ~200 bytes = ~1.4KB (limit: 9KB — safe!)
// =============================================================================

function llcStoreTasks(tasks) {
  var slim = tasks.map(function(t) {
    return {
      account:   t.account,
      apiKey:    t.apiKey,
      taskId:    t.taskId,
      sheetName: t.sheetName,
      statusCol: t.statusCol,
      emailCol:  t.emailCol,
      dateCol:   t.dateCol || null  // Verification Date column (1-indexed)
    };
  });
  PropertiesService.getScriptProperties().setProperty(LLC_TASKS_PROP_KEY, JSON.stringify(slim));
  Logger.log("Stored " + slim.length + " tasks (" + JSON.stringify(slim).length + " bytes)");
}

function llcGetStoredTasks() {
  var raw = PropertiesService.getScriptProperties().getProperty(LLC_TASKS_PROP_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch(e) { return []; }
}

// =============================================================================
//  TRIGGER MANAGEMENT
// =============================================================================

function llcScheduleResultTrigger() {
  var fnName = "checkPendingTaskResults";
  var exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === fnName; });
  if (!exists) {
    ScriptApp.newTrigger(fnName).timeBased().everyMinutes(LLC_TRIGGER_MINUTES).create();
    Logger.log("⏱ Trigger created: every " + LLC_TRIGGER_MINUTES + " minute(s).");
  }
}

function llcDeleteResultTrigger() {
  var fnName = "checkPendingTaskResults";
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === fnName) { ScriptApp.deleteTrigger(t); }
  });
}

// =============================================================================
//  UTILITIES
// =============================================================================



function clearAllPendingTasks() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.alert("⚠️ Warning", "All pending tasks will be deleted.\nAre you sure?", ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty(LLC_TASKS_PROP_KEY);
  llcDeleteResultTrigger();
  ui.alert("✅ All pending tasks deleted successfully.");
}

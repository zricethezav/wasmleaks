/**
 * Gitleaks WASM Integration and UI Management
 *
 * This file ties together our secret scanning logic (powered by Gitleaks via WASM)
 * with the browser's UI. It handles scanning operations, displays findings,
 * and integrates with the Rule Wizard.
 */

// =============================================
// Global Variables
// =============================================
let gitleaksModule;
let currentFindings = [];
let currentSort = { column: null, direction: 'asc' };
let highlightMarkers = [];

// =============================================
// WASM & Gitleaks Module Loading
// =============================================

/**
 * Loads the default configuration from the WASM function, if available.
 */
function loadDefaultConfig() {
  if (typeof window.getDefaultConfig !== 'function') {
    console.warn("getDefaultConfig() not found. Possibly WASM not loaded yet.");
    return;
  }
  
  // Check if we have a pending shared state from a URL
  if (window.pendingSharedState) {
    console.log("Found pending shared state, loading instead of default config");
    
    // If we're using the default config flag, just load default config with custom settings
    if (window.pendingSharedState.useDefaultConfig) {
      console.log("Using default config with custom settings");
      const defaultConfig = window.getDefaultConfig();
      configEditor.setValue(defaultConfig);
      
      // Apply custom settings
      if (window.pendingSharedState.logLevel) {
        document.getElementById("logLevelSelect").value = window.pendingSharedState.logLevel;
      }
      
      if (window.pendingSharedState.activeTab) {
        document.querySelector(`.tab-btn[data-tab="${window.pendingSharedState.activeTab}"]`).click();
      }
    }
    // Otherwise load custom config from the shared state
    else if (window.pendingSharedState.config) {
      configEditor.setValue(window.pendingSharedState.config);
      
      // Set log level if present
      if (window.pendingSharedState.logLevel) {
        document.getElementById("logLevelSelect").value = window.pendingSharedState.logLevel;
      }
      
      // Switch to the correct tab if specified
      if (window.pendingSharedState.activeTab) {
        document.querySelector(`.tab-btn[data-tab="${window.pendingSharedState.activeTab}"]`).click();
      }
    }
    
    // Load input text if present in a separate window variable
    if (window.pendingInputText) {
      editor.setValue(window.pendingInputText);
      window.pendingInputText = null;
    }
    
    // Clear the pending state so we don't load it again
    window.pendingSharedState = null;
    
    // Show notification
    showNotification("Shared configuration loaded successfully!");
    
    // Hide the loading overlay now that content is loaded
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
    
    return;
  }
  
  try {
    const defaultConfig = window.getDefaultConfig();
    configEditor.setValue(defaultConfig);
    console.log("Default config loaded into editor");
    
    // Hide the loading overlay if it exists (for cases where hash existed but was invalid)
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
  } catch (err) {
    console.error("Error fetching default config:", err);
    
    // Hide the loading overlay on error
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
  }
}

/**
 * Loads and initializes the Gitleaks WASM module.
 */
async function loadGitleaks() {
  console.log("Starting Gitleaks loading process...");

  if (!window.Go) {
    console.error("Go is not defined! Make sure wasm_exec.js is loaded properly");
    throw new Error("Go is not defined");
  }

  const go = new Go();
  console.log("Go instance created");

  try {
    console.log("Fetching gitleaks.wasm...");
    const response = await fetch("gitleaks.wasm");
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    console.log("WASM buffer received, instantiating...");

    const result = await WebAssembly.instantiate(buffer, go.importObject);
    gitleaksModule = result.instance;
    console.log("WASM module instantiated");

    console.log("Starting Go runtime...");
    // Run the Go runtime (don't await so that the UI can continue initializing)
    go.run(gitleaksModule);

    console.log("Gitleaks successfully loaded and functions registered");
    loadDefaultConfig();
  } catch (err) {
    console.error("Error during Gitleaks initialization:", err);
    document.getElementById("results").innerHTML = `<p class="error">Failed to load Gitleaks WASM: ${err}</p>`;
  }
}

// =============================================
// Scanning and Results Handling
// =============================================

/**
 * Initiates a secret scan on the content from the editor.
 */
async function scan() {
  // Clear any existing highlights in the editor
  clearHighlights();

  // Update and validate config each time the scan is initiated
  if (typeof window.setUserConfig !== 'function') {
    console.error("setUserConfig() not available. Is WASM loaded?");
    document.getElementById("results").innerHTML =
      "<p class='error'>Error: setUserConfig function not loaded.</p>";
    return;
  }
  
  const configStr = configEditor.getValue();
  const configResult = window.setUserConfig(configStr);
  
  if (typeof configResult === 'string' && configResult.startsWith("Error:")) {
    document.getElementById("results").innerHTML = `<p class='error'>${configResult}</p>`;
    return;
  }

  const inputText = editor.getValue();
  const scannedBytes = new Blob([inputText]).size;
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  // Show spinner during scanning
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  resultsDiv.appendChild(spinner);

  // Allow the spinner to render before starting the scan
  await new Promise(resolve => setTimeout(resolve, 50));

  // Get the selected log level from the dropdown
  const logLevel = document.getElementById("logLevelSelect").value;

  const startTime = performance.now();
  let scanResult;
  
  try {
    // Pass both the input text and the log level to the WASM function
    scanResult = window.scanTextWithGitleaks(inputText, logLevel);
  } catch (error) {
    console.error("Error during scan:", error);
    resultsDiv.innerHTML = `<p class="error">Error during scan: ${error.message}</p>`;
    return;
  }
  
  const elapsed = performance.now() - startTime;

  let logs, findingsArray;
  if (scanResult && typeof scanResult === 'object' && scanResult.logs !== undefined) {
    logs = scanResult.logs;
    findingsArray = scanResult.findings;
  } else {
    findingsArray = scanResult;
    logs = `Scan completed in ${elapsed.toFixed(2)} ms.<br>Scanned ${scannedBytes} bytes.<br>Found ${Array.isArray(findingsArray) ? findingsArray.length : 0} secrets.`;
  }
  
  // Replace newline characters with <br> for proper formatting.
  const statsMsg = document.createElement('p');
  statsMsg.className = 'scan-stats';
  statsMsg.innerHTML = logs.replace(/\n/g, '<br>');
  
  resultsDiv.innerHTML = "";
  resultsDiv.appendChild(statsMsg);

  if (typeof findingsArray === 'string' && findingsArray.startsWith("Error:")) {
    resultsDiv.innerHTML += `<p class="error">${findingsArray}</p>`;
    return;
  }
  
  currentFindings = Array.isArray(findingsArray) ? findingsArray : [findingsArray];
  displayFindings(currentFindings);
}

/**
 * Renders the scan findings in a table.
 * @param {Array} findings - List of secret findings.
 */
function displayFindings(findings) {
  const resultsDiv = document.getElementById('results');
  
  // Preserve scan stats message while updating the results display
  let statsMsg = resultsDiv.querySelector('.scan-stats');
  resultsDiv.innerHTML = "";
  if (statsMsg) resultsDiv.appendChild(statsMsg);

  if (!findings || findings.length === 0) {
    resultsDiv.innerHTML += "<p>No secrets found.</p>";
    return;
  }

  // Add toolbar with action buttons
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  
  const highlightBtn = document.createElement('button');
  highlightBtn.textContent = 'Highlight All';
  highlightBtn.className = 'btn btn-sm';
  highlightBtn.onclick = highlightAll;
  
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear Highlights';
  clearBtn.className = 'btn btn-sm';
  clearBtn.onclick = clearHighlights;
  
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download Report';
  downloadBtn.className = 'btn btn-sm';
  downloadBtn.onclick = downloadReport;
  
  toolbar.appendChild(highlightBtn);
  toolbar.appendChild(clearBtn);
  toolbar.appendChild(downloadBtn);
  resultsDiv.appendChild(toolbar);

  // Table wrapper for scrollability
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';

  // Create findings table
  const table = createTable(findings);
  tableWrapper.appendChild(table);
  resultsDiv.appendChild(tableWrapper);
}

/**
 * Constructs the HTML table for displaying secret findings.
 * @param {Array} findings - The list of findings.
 * @returns {HTMLElement} The constructed table element.
 */
function createTable(findings) {
  const columns = [
    { key: 'ruleID', label: 'Rule' },
    { key: 'entropy', label: 'Entropy' },
    { key: 'secret', label: 'Secret' },
    { key: 'startLine', label: 'Line' }
  ];

  const table = document.createElement('table');
  table.className = 'findings-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.onclick = () => handleSort(column.key);
    
    if (currentSort.column === column.key) {
      th.className = currentSort.direction;
    }
    
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');
  const sortedFindings = currentSort.column
    ? sortFindings(findings, currentSort.column, currentSort.direction)
    : findings;
  
  sortedFindings.forEach(finding => {
    const row = document.createElement('tr');
    
    columns.forEach(column => {
      const td = document.createElement('td');
      
      if (column.key === 'secret') {
        const pre = document.createElement('pre');
        pre.textContent = finding[column.key] || '';
        td.appendChild(pre);
      } else {
        td.textContent = column.key === 'entropy' 
          ? parseFloat(finding[column.key]).toFixed(2) 
          : (finding[column.key] || '');
      }
      
      row.appendChild(td);
    });
    
    // Allow clicking on a row to scroll to and highlight the secret in the editor
    row.style.cursor = 'pointer';
    row.onclick = () => {
      if (finding.startLine !== undefined && finding.match && finding.secret) {
        scrollAndHighlight(finding);
      }
    };
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  return table;
}

// =============================================
// Highlighting Functions
// =============================================

/**
 * Scrolls the editor to the specified finding and highlights the matching secret text.
 * @param {Object} finding - The finding object containing match details.
 */
function scrollAndHighlight(finding) {
  const lineIndex = finding.startLine - 1; // Adjust for CodeMirror's 0-indexed lines
  const lineText = editor.getLine(lineIndex);
  let matchStart = lineText.indexOf(finding.match);
  
  if (matchStart === -1) {
    // Fallback: search for the secret directly
    matchStart = lineText.indexOf(finding.secret);
    
    if (matchStart === -1) {
      console.warn("Cannot find match or secret in the target line.");
      return;
    }
    
    clearHighlights();
    const secretMarker = editor.markText(
      { line: lineIndex, ch: matchStart },
      { line: lineIndex, ch: matchStart + finding.secret.length },
      { className: 'highlight-red' }
    );
    
    highlightMarkers.push(secretMarker);
    editor.scrollIntoView({ line: lineIndex, ch: matchStart }, 100);
    return;
  }
  
  const secretOffset = finding.match.indexOf(finding.secret);
  
  if (secretOffset < 0) {
    console.warn("Secret not found within match text.");
    return;
  }
  
  const secretStart = matchStart + secretOffset;
  const secretEnd = secretStart + finding.secret.length;
  const matchEnd = matchStart + finding.match.length;
  
  editor.scrollIntoView({ line: lineIndex, ch: matchStart }, 100);
  clearHighlights();
  
  if (secretOffset > 0) {
    const preMarker = editor.markText(
      { line: lineIndex, ch: matchStart },
      { line: lineIndex, ch: secretStart },
      { className: 'highlight-yellow' }
    );
    highlightMarkers.push(preMarker);
  }
  
  const secretMarker = editor.markText(
    { line: lineIndex, ch: secretStart },
    { line: lineIndex, ch: secretEnd },
    { className: 'highlight-red' }
  );
  highlightMarkers.push(secretMarker);
  
  if (secretEnd < matchEnd) {
    const postMarker = editor.markText(
      { line: lineIndex, ch: secretEnd },
      { line: lineIndex, ch: matchEnd },
      { className: 'highlight-yellow' }
    );
    highlightMarkers.push(postMarker);
  }
}

/**
 * Highlights a finding in the editor without scrolling.
 * @param {Object} finding - The finding object to highlight.
 */
function highlightFinding(finding) {
  const lineIndex = finding.startLine - 1;
  const lineText = editor.getLine(lineIndex);
  let matchStart = lineText.indexOf(finding.match);
  
  if (matchStart === -1) {
    matchStart = lineText.indexOf(finding.secret);
    
    if (matchStart === -1) {
      console.warn("Cannot find match or secret in the target line.");
      return;
    }
    
    // Fallback: highlight secret in red
    const marker = editor.markText(
      { line: lineIndex, ch: matchStart },
      { line: lineIndex, ch: matchStart + finding.secret.length },
      { className: 'highlight-red' }
    );
    
    highlightMarkers.push(marker);
    return;
  }
  
  const secretOffset = finding.match.indexOf(finding.secret);
  
  if (secretOffset < 0) {
    console.warn("Secret not found within match text.");
    return;
  }
  
  const secretStart = matchStart + secretOffset;
  const secretEnd = secretStart + finding.secret.length;
  const matchEnd = matchStart + finding.match.length;
  
  if (secretOffset > 0) {
    const preMarker = editor.markText(
      { line: lineIndex, ch: matchStart },
      { line: lineIndex, ch: secretStart },
      { className: 'highlight-yellow' }
    );
    highlightMarkers.push(preMarker);
  }
  
  const secretMarker = editor.markText(
    { line: lineIndex, ch: secretStart },
    { line: lineIndex, ch: secretEnd },
    { className: 'highlight-red' }
  );
  highlightMarkers.push(secretMarker);
  
  if (secretEnd < matchEnd) {
    const postMarker = editor.markText(
      { line: lineIndex, ch: secretEnd },
      { line: lineIndex, ch: matchEnd },
      { className: 'highlight-yellow' }
    );
    highlightMarkers.push(postMarker);
  }
}

/**
 * Clears all highlight markers from the editor.
 */
function clearHighlights() {
  highlightMarkers.forEach(marker => marker.clear());
  highlightMarkers = [];
}

/**
 * Highlights all findings in the editor.
 */
function highlightAll() {
  clearHighlights();
  
  currentFindings.forEach(finding => {
    if (finding.startLine !== undefined && finding.match && finding.secret) {
      highlightFinding(finding);
    }
  });
}

/**
 * Sorts the findings array based on a given column and direction.
 * @param {Array} findings - The findings to sort.
 * @param {string} column - The key to sort by.
 * @param {string} direction - 'asc' or 'desc'.
 * @returns {Array} The sorted findings.
 */
function sortFindings(findings, column, direction) {
  return [...findings].sort((a, b) => {
    let aVal = a[column] || '';
    let bVal = b[column] || '';

    if (!isNaN(aVal) && !isNaN(bVal)) {
      aVal = Number(aVal);
      bVal = Number(bVal);
    }

    if (direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
}

/**
 * Handles column header clicks to sort findings.
 * @param {string} column - The column key to sort by.
 */
function handleSort(column) {
  const direction =
    currentSort.column === column && currentSort.direction === 'asc'
      ? 'desc'
      : 'asc';
      
  currentSort = { column, direction };
  displayFindings(currentFindings);
}

/**
 * Generates and downloads a JSON report of the scan findings.
 */
function downloadReport() {
  if (!currentFindings || currentFindings.length === 0) {
    return;
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    findings: currentFindings
  };
  
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gitleaks-report-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =============================================
// Rule Wizard Functions
// =============================================

/**
 * Updates the visible fields in the Rule Wizard based on the selected rule type.
 * Already defined in ui.js
 */
/* function updateWizardFields() { ... } */

/**
 * Updates the display for capture type fields.
 */
function updateCaptureTypeDisplay() {
  const captureType = document.getElementById('captureType').value;
  
  if (captureType === "manual") {
    document.getElementById('captureManualDiv').style.display = 'block';
    document.getElementById('capturePresetDiv').style.display = 'none';
  } else {
    document.getElementById('captureManualDiv').style.display = 'none';
    document.getElementById('capturePresetDiv').style.display = 'block';
    
    const preset = document.getElementById('capturePreset').value;
    if (preset === "Hex8_4_4_4_12") {
      document.getElementById('presetRangeDiv').style.display = 'none';
    } else {
      document.getElementById('presetRangeDiv').style.display = 'block';
    }
  }
}

/**
 * Updates the generated rule in the Rule Wizard based on current input values.
 */
function updateGeneratedRule() {
  const ruleType = document.getElementById('ruleType').value;
  const id = document.getElementById('ruleId').value;
  const description = document.getElementById('ruleDescription').value;
  let regex = "";
  let entropy = "";
  let keyword = "";
  let secretRegex = "";
  
  if (ruleType === "semi") {
    const identifiers = document.getElementById('identifiers').value;
    entropy = document.getElementById('entropySemi').value;
    const keywordSemi = document.getElementById('keywordSemi').value;
    const captureType = document.getElementById('captureType').value;
    
    if (captureType === "manual") {
      secretRegex = document.getElementById('captureManual').value;
    } else {
      const preset = document.getElementById('capturePreset').value;
      
      if (preset === "Hex8_4_4_4_12") {
        secretRegex = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
      } else {
        const captureMin = document.getElementById('captureMin').value;
        const captureMax = document.getElementById('captureMax').value;
        const presetMapping = {
          "Numeric": "0-9",
          "Hex": "a-f0-9",
          "AlphaNumeric": "a-z0-9",
          "AlphaNumericExtendedShort": "a-z0-9_-",
          "AlphaNumericExtended": "a-z0-9=_\\-",
          "AlphaNumericExtendedLong": "a-z0-9\\/_=_\\+\\-"
        };
        
        secretRegex = "[" + presetMapping[preset] + "]{" + captureMin + "," + captureMax + "}";
      }
    }
    
    regex = generateSemiGenericRegex(identifiers, secretRegex);
    keyword = keywordSemi;
  } else if (ruleType === "unique") {
    const regexInput = document.getElementById('regexUnique').value;
    entropy = document.getElementById('entropyUnique').value;
    keyword = document.getElementById('keyword').value;
    regex = generateUniqueRegex(regexInput);
  }
  
  let ruleToml = "\n[[rules]]\n";
  if (id) ruleToml += `id = "${id}"\n`;
  if (description) ruleToml += `description = "${description}"\n`;
  if (regex) ruleToml += `regex = '''${regex}'''\n`;
  if (entropy) ruleToml += `entropy = ${entropy}\n`;
  
  if (keyword) {
    let keywords = keyword.split(",").map(k => k.trim()).filter(k => k);
    ruleToml += `keywords = [${keywords.map(k => `"${k}"`).join(", ")}]\n`;
  }
  
  document.getElementById('generatedRule').value = ruleToml;
}

/**
 * Generates a semi-generic regex based on identifiers and a secret regex.
 * @param {string} identifiersStr - Comma-separated identifiers.
 * @param {string} secretRegex - The regex for capturing the secret.
 * @returns {string} The generated regex pattern.
 */
function generateSemiGenericRegex(identifiersStr, secretRegex) {
  const caseInsensitive = "(?i)";
  const identifierPrefix = "[\\w.-]{0,50}?(?:";
  const identifierSuffix = ")(?:[ \\t\\w.-]{0,20})[\\s'\"]{0,3}";
  const operator = "(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)";
  const secretPrefix = "[\\x60'\"\\s=]{0,5}(";
  const secretSuffix = ")(?:[\\x60'\"\\s;]|\\\\[nr]|$)";
  
  let identifiers = identifiersStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
  
  if (identifiers.length === 0) {
    return "";
  }
  
  const idPart = identifierPrefix + identifiers.join("|") + identifierSuffix;
  return caseInsensitive + idPart + operator + secretPrefix + secretRegex + secretSuffix;
}

/**
 * Generates a unique regex pattern based on user input.
 * @param {string} secretRegex - The user-provided regex.
 * @param {boolean} [isCaseInsensitive=true] - Whether the regex should be case-insensitive.
 * @returns {string} The generated regex pattern.
 */
function generateUniqueRegex(secretRegex, isCaseInsensitive = true) {
  const caseInsensitive = "(?i)";
  const secretPrefixUnique = "\\b(";
  const secretSuffix = ")(?:[\\x60'\"\\s;]|\\\\[nr]|$)";
  
  let regex = "";
  
  if (isCaseInsensitive) {
    regex += caseInsensitive;
  }
  
  regex += secretPrefixUnique + secretRegex + secretSuffix;
  return regex;
}

/**
 * Copies the generated rule from the Rule Wizard to the clipboard.
 */
function copyGeneratedRule() {
  const ruleText = document.getElementById('generatedRule').value;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ruleText)
      .then(() => {
        // Show a temporary copy success indicator
        const copyBtn = document.getElementById('copyRuleBtn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  } else {
    // Fallback for browsers without clipboard API
    const textarea = document.getElementById('generatedRule');
    const currentSelectionStart = textarea.selectionStart;
    const currentSelectionEnd = textarea.selectionEnd;
    textarea.select();
    document.execCommand("copy");
    textarea.setSelectionRange(currentSelectionStart, currentSelectionEnd);
    
    // Show copy feedback
    const copyBtn = document.getElementById('copyRuleBtn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  }
}


// Initialize Gitleaks on page load
console.log("Starting initialization...");
loadGitleaks().then(() => {
  // Check if we need to handle a pending shared state that hasn't been processed yet
  if (window.pendingSharedState) {
    console.log("Processing pending shared state after WASM load");
    setTimeout(() => {
      window.loadSharedState(window.pendingSharedState);
      window.pendingSharedState = null;
      
      // Hide loading overlay after state is fully loaded
      if (typeof hideLoadingOverlay === 'function') {
        hideLoadingOverlay();
      }
    }, 100); // Small delay to ensure everything is ready
  } else {
    // No pending state, hide loading overlay if it exists
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
  }
}).catch(err => {
  console.error("Failed to load Gitleaks WASM:", err);
  document.getElementById("results").innerHTML = `<p class="error">Failed to load Gitleaks WASM: ${err}</p>`;
  
  // Hide loading overlay on error
  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }
});
/**
 * UI JavaScript for Secret Scanning
 * 
 * This script handles all UI interactions including:
 * - Tab switching
 * - Theme toggling
 * - CodeMirror initialization
 * - Entropy calculation
 * - Resizable editor functionality
 * - State sharing via URL fragments
 */

// Global variables
let editor;               // CodeMirror instance for input text
let configEditor;         // CodeMirror instance for config
let activeTab = 'scan';   // Currently active tab
let isResizing = false;   // Flag to track resize state

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
  // Check if we have a hash in the URL - if so, show loading overlay
  if (window.location.hash && window.location.hash.length > 1) {
    showLoadingOverlay();
  }

  initTabs();
  initThemeToggle();
  initCodeMirrorEditors();
  addCharacterCounter();
  initEntropyCalculator();
  initScanButton();
  initCopyRuleButton();
  initResizableEditor();
  initSharingFeature();
  
  // Check for saved theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('toggle-theme-btn').textContent = '🌙';
  }
});

/**
 * Initialize tab switching functionality
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked tab
      button.classList.add('active');
      
      // Hide all tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
      });
      
      // Show the selected tab
      const tabId = button.getAttribute('data-tab');
      const activeContent = document.getElementById(`${tabId}-tab`);
      if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'flex';
        
        // Update active tab
        activeTab = tabId;
        
        // Refresh CodeMirror instances when switching tabs to ensure they render correctly
        setTimeout(() => {
          if (editor) editor.refresh();
          if (configEditor) configEditor.refresh();
        }, 5);
      }
    });
  });
}

/**
 * Initialize theme toggle functionality
 */
function initThemeToggle() {
  const toggleBtn = document.getElementById('toggle-theme-btn');

  // Remove preload class once ready
  document.documentElement.classList.remove('dark-mode-preload');
  
  toggleBtn.addEventListener('click', () => {
    // Toggle dark mode class on body
    document.body.classList.toggle('dark-mode');
    
    // Update button icon
    const isDarkMode = document.body.classList.contains('dark-mode');
    toggleBtn.textContent = isDarkMode ? '🌙' : '💡';
    
    // Save preference
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Refresh CodeMirror instances to update their theme
    if (editor) editor.refresh();
    if (configEditor) configEditor.refresh();
  });
}

/**
 * Initialize CodeMirror editors
 */
function initCodeMirrorEditors() {
  // Initialize content editor
  const textArea = document.getElementById('inputText');
  editor = CodeMirror.fromTextArea(textArea, {
    lineNumbers: true,
    theme: 'idea',
    mode: 'text/plain', // Using plain text mode without syntax highlighting
    viewportMargin: Infinity,
    lineWrapping: true,
    tabSize: 4,
    indentWithTabs: false
  });
  
  // Initialize config editor
  const configTextArea = document.getElementById('configText');
  configEditor = CodeMirror.fromTextArea(configTextArea, {
    lineNumbers: true,
    theme: 'idea',
    mode: 'text/x-toml',
    viewportMargin: Infinity,
    lineWrapping: true,
    tabSize: 4,
    indentWithTabs: false
  });
  
  // Initialize load default config button
  document.getElementById('loadDefaultConfigBtn').addEventListener('click', loadDefaultConfig);
}

/**
 * Initialize resizable editor functionality
 */
function initResizableEditor() {
  const resizeHandle = document.getElementById('resizeHandle');
  const editorSection = document.querySelector('.editor-section');
  
  if (!resizeHandle || !editorSection) return;
  
  // Try to load saved height from localStorage
  const savedHeight = localStorage.getItem('editorHeight');
  if (savedHeight) {
    editorSection.style.height = savedHeight;
  }
  
  // Set up resize event listeners
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    
    // Add resize events to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Add a class to the body to change cursor while resizing
    document.body.style.cursor = 'ns-resize';
    resizeHandle.classList.add('active');
  });
  
  // Touch support for mobile
  resizeHandle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isResizing = true;
    
    // Add touch events to document
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    
    resizeHandle.classList.add('active');
  });
  
  /**
   * Handle mouse movement during resize
   */
  function handleMouseMove(e) {
    if (!isResizing) return;
    
    // Calculate new height
    const containerRect = document.querySelector('.resizable-container').getBoundingClientRect();
    const containerTop = containerRect.top;
    const newHeight = Math.max(100, e.clientY - containerTop);
    
    // Update editor height
    editorSection.style.height = `${newHeight}px`;
    
    // Refresh CodeMirror
    if (editor) editor.refresh();
  }
  
  /**
   * Handle touch movement during resize
   */
  function handleTouchMove(e) {
    if (!isResizing || !e.touches[0]) return;
    
    // Calculate new height
    const containerRect = document.querySelector('.resizable-container').getBoundingClientRect();
    const containerTop = containerRect.top;
    const newHeight = Math.max(100, e.touches[0].clientY - containerTop);
    
    // Update editor height
    editorSection.style.height = `${newHeight}px`;
    
    // Refresh CodeMirror
    if (editor) editor.refresh();
  }
  
  /**
   * Handle mouse up to end resize
   */
  function handleMouseUp() {
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Reset cursor
    document.body.style.cursor = '';
    resizeHandle.classList.remove('active');
    
    // Save the current height to localStorage
    localStorage.setItem('editorHeight', editorSection.style.height);
  }
  
  /**
   * Handle touch end to end resize
   */
  function handleTouchEnd() {
    isResizing = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    
    resizeHandle.classList.remove('active');
    
    // Save the current height to localStorage
    localStorage.setItem('editorHeight', editorSection.style.height);
  }
  
  // Add double-click handler to reset height to default
  resizeHandle.addEventListener('dblclick', () => {
    editorSection.style.height = 'var(--default-editor-height)';
    if (editor) editor.refresh();
    
    // Save the default height
    localStorage.setItem('editorHeight', editorSection.style.height);
  });
}

/**
 * Initialize entropy calculator
 */
function initEntropyCalculator() {
  const entropyInput = document.getElementById('entropyInput');
  const entropyOutput = document.getElementById('entropyOutput');
  
  entropyInput.addEventListener('input', () => {
    const value = entropyInput.value;
    const entropy = shannonEntropy(value);
    entropyOutput.textContent = `Entropy: ${entropy.toFixed(2)}`;
  });
}

/**
 * Initialize scan button
 */
function initScanButton() {
  document.getElementById('scanBtn').addEventListener('click', () => {
    // Call the scan function from gitleaks.js
    if (typeof scan === 'function') {
      scan();
    } else {
      console.error('Scan function not available');
    }
  });
}

/**
 * Initialize copy rule button
 */
function initCopyRuleButton() {
  document.getElementById('copyRuleBtn').addEventListener('click', copyGeneratedRule);
}

/**
 * Initialize the sharing feature
 */
function initSharingFeature() {
  // Add share button event listener
  document.getElementById('share-btn').addEventListener('click', shareState);
  
  // Check for shared state when page loads
  checkForSharedState();
}

/**
 * Serialize the current state for sharing
 * @param {boolean} includeInputText - Whether to include the input text
 * @returns {Object} Serialized state object
 */
function serializeState(includeInputText = false) {
  // Only collect content and config state
  const state = {
    config: configEditor.getValue(),
    activeTab: activeTab,
    logLevel: document.getElementById("logLevelSelect").value
  };
  
  // Only include input text if explicitly requested
  if (includeInputText) {
    state.inputText = editor.getValue();
  }
  
  return state;
}

/**
 * Serialize the current state for sharing
 * @param {boolean} includeInputText - Whether to include the input text
 * @returns {Object} Serialized state object
 */
function serializeState(includeInputText = false) {
  // Only collect content and config state
  const state = {
    config: configEditor.getValue(),
    activeTab: activeTab,
    logLevel: document.getElementById("logLevelSelect").value
  };
  
  // Only include input text if explicitly requested
  if (includeInputText) {
    state.inputText = editor.getValue();
  }
  
  return state;
}

/**
 * Compress state JSON to make URLs shorter using Pako (gzip) compression
 * @param {string} stateJson - JSON string to compress
 * @returns {Promise<string>} Compressed and encoded string
 */
async function compressState(stateJson) {
  try {
    // Check if pako is available
    if (!window.pako) {
      console.error("Pako library not loaded");
      throw new Error("Compression library not available");
    }
    
    // Convert string to Uint8Array
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(stateJson);
    
    // Compress with pako (gzip)
    const compressed = window.pako.deflate(data, { level: 9 });
    
    // Convert compressed bytes to Base64
    const compressedBase64 = btoa(
      Array.from(compressed)
        .map(byte => String.fromCharCode(byte))
        .join('')
    );
    
    return compressedBase64;
  } catch (err) {
    console.error("Error during compression:", err);
    throw err;
  }
}

/**
 * Decompress data from URL fragment
 * @param {string} compressed - Compressed state string
 * @returns {Promise<Object>} Decompressed state object
 */
async function decompressState(compressed) {
  try {
    // Check if pako is available
    if (!window.pako) {
      throw new Error("Pako library not loaded");
    }
    
    // Decode Base64
    const byteCharacters = atob(compressed);
    
    // Convert string to byte array
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    
    // Decompress with pako
    const decompressed = window.pako.inflate(byteArray);
    
    // Convert Uint8Array back to string
    const textDecoder = new TextDecoder();
    const jsonStr = textDecoder.decode(decompressed);
    
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Decompression error:", err);
    throw new Error("Failed to decode shared state: " + err.message);
  }
}

/**
 * Check if the current configuration is the default one
 * @returns {boolean} True if using default config
 */
function isDefaultConfig() {
  if (!window.getDefaultConfig || typeof window.getDefaultConfig !== 'function') {
    return false;
  }
  
  try {
    const defaultConfig = window.getDefaultConfig();
    const currentConfig = configEditor.getValue();
    
    // Compare configs - ignoring whitespace variations
    const normalizedDefault = defaultConfig.replace(/\s+/g, ' ').trim();
    const normalizedCurrent = currentConfig.replace(/\s+/g, ' ').trim();
    
    return normalizedDefault === normalizedCurrent;
  } catch (err) {
    console.error("Error checking default config:", err);
    return false;
  }
}

/**
 * Share the current state via URL fragment with variable format
 * Always includes input text and always shows the share modal
 */
async function shareState() {
  try {
    // Show processing indicator
    showNotification("Generating share link...", "processing");
    
    // Check if using default config
    const usingDefaultConfig = isDefaultConfig();
    
    // Get and compress configuration if not using default
    let shareUrl = `${window.location.origin}${window.location.pathname}#`;
    
    if (!usingDefaultConfig) {
      const configState = {
        config: configEditor.getValue(),
        logLevel: document.getElementById("logLevelSelect").value,
        activeTab: activeTab
      };
      
      const configStateJson = JSON.stringify(configState);
      const compressedConfig = await compressState(configStateJson);
      shareUrl += `conf=${compressedConfig}`;
    } else {
      // Just add a flag indicating default config with log level
      const logLevel = document.getElementById("logLevelSelect").value;
      shareUrl += `default=1&log=${logLevel}&tab=${activeTab}`;
    }
    
    // Always include input text
    const inputText = editor.getValue();
    if (inputText && inputText.trim() !== "") {
      const contentState = { inputText };
      const contentStateJson = JSON.stringify(contentState);
      const compressedContent = await compressState(contentStateJson);
      
      // Add appropriate connector
      shareUrl += shareUrl.includes('=') ? '&' : '';
      shareUrl += `content=${compressedContent}`;
    }
    
    // Always show the share link modal (no clipboard copying)
    showShareLink(shareUrl);
    
    // Remove the processing notification
    document.querySelectorAll(`.notification.notification-processing`).forEach(el => el.remove());
    
  } catch (err) {
    console.error("Failed to create share link:", err);
    showNotification("Error creating share link: " + err.message, "error");
  }
}


/**
 * Parse URL parameters from the fragment
 * @returns {Object} Map of parameter name to value
 */
function parseUrlFragment() {
  if (!window.location.hash || window.location.hash.length <= 1) {
    return {};
  }
  
  const fragment = window.location.hash.substring(1);
  const params = {};
  
  // Split by & but not inside compressed data (which may contain &)
  let currentParam = "";
  let inValue = false;
  
  for (let i = 0; i < fragment.length; i++) {
    const char = fragment[i];
    
    if (char === '=' && !inValue) {
      inValue = true;
      const key = currentParam;
      currentParam = "";
      params[key] = "";
    } else if (char === '&' && !inValue) {
      // Skip empty parameters
      currentParam = "";
    } else if (char === '&' && inValue) {
      inValue = false;
      currentParam = "";
    } else {
      currentParam += char;
      if (inValue) {
        params[Object.keys(params).pop()] = currentParam;
      }
    }
  }
  
  return params;
}


/**
 * Check for shared state in URL fragment on page load
 */
async function checkForSharedState() {
  try {
    const params = parseUrlFragment();
    
    if (Object.keys(params).length === 0) {
      // No shared state, remove loading overlay if it exists
      hideLoadingOverlay();
      editor.setValue(`some fake secrets to mess around with\n\n`
        + `discord_client_secret = '8dyfuiRyq=vVc3RRr_edRk-fK__JItpZ'\n`
        + `const FastlyAPIToken = "uhZtofOcNnzoH6F5-m0bzsLvCqIjzNFG"`
      );
      return;
    }
    
    // Show loading indicator if not already shown
    if (!window.loadingOverlay) {
      showLoadingOverlay();
    }
    
    // Check for default config flag
    if (params.default === '1') {
      // Create a minimal state object with just log level and active tab
      window.pendingSharedState = {
        // Let loadDefaultConfig() handle setting the default config
        useDefaultConfig: true,
        logLevel: params.log || 'Info',
        activeTab: params.tab || 'scan'
      };
    }
    // Parse configuration if provided
    else if (params.conf) {
      try {
        const configState = await decompressState(params.conf);
        window.pendingSharedState = configState;
      } catch (err) {
        console.error("Failed to parse configuration state:", err);
        showNotification("Failed to load shared configuration.", "error");
        hideLoadingOverlay();
      }
    }
    
    // Parse content if present
    if (params.content) {
      try {
        const contentState = await decompressState(params.content);
        if (contentState.inputText) {
          window.pendingInputText = contentState.inputText;
        }
      } catch (err) {
        console.error("Failed to parse content state:", err);
        showNotification("Failed to load shared content.", "error");
      }
    }
    
  } catch (err) {
    console.error("Failed to process shared state:", err);
    showNotification("Failed to load shared configuration.", "error");
    hideLoadingOverlay();
  }
}

/**
 * Load shared state into the app
 * @param {Object} state - The state object to load
 */
window.loadSharedState = function(state) {
  // Load main state
  if (state.config) configEditor.setValue(state.config);
  if (state.logLevel) document.getElementById("logLevelSelect").value = state.logLevel;
  
  // Load input text if it exists
  if (state.inputText) editor.setValue(state.inputText);
  
  // Load wizard state if it exists
  if (state.wizard) {
    // Set basic fields
    document.getElementById('ruleType').value = state.wizard.ruleType;
    document.getElementById('ruleId').value = state.wizard.ruleId || '';
    document.getElementById('ruleDescription').value = state.wizard.ruleDescription || '';
    
    // Update visible fields based on rule type
    updateWizardFields();
    
    // Set type-specific fields
    if (state.wizard.ruleType === 'semi') {
      document.getElementById('identifiers').value = state.wizard.identifiers || '';
      document.getElementById('entropySemi').value = state.wizard.entropySemi || '';
      document.getElementById('keywordSemi').value = state.wizard.keywordSemi || '';
      document.getElementById('captureType').value = state.wizard.captureType || 'manual';
      
      if (state.wizard.captureType === 'manual') {
        document.getElementById('captureManual').value = state.wizard.captureManual || '';
      } else {
        document.getElementById('capturePreset').value = state.wizard.capturePreset || 'Numeric';
        document.getElementById('captureMin').value = state.wizard.captureMin || '';
        document.getElementById('captureMax').value = state.wizard.captureMax || '';
      }
      
      updateCaptureTypeDisplay();
    } else {
      document.getElementById('regexUnique').value = state.wizard.regexUnique || '';
      document.getElementById('entropyUnique').value = state.wizard.entropyUnique || '';
      document.getElementById('keyword').value = state.wizard.keyword || '';
    }
    
    // Update generated rule
    updateGeneratedRule();
  }
  
  // Switch to the saved active tab
  if (state.activeTab) {
    document.querySelector(`.tab-btn[data-tab="${state.activeTab}"]`).click();
  }
  
  // Refresh editors
  if (editor) editor.refresh();
  if (configEditor) configEditor.refresh();
  
  // Show success notification
  showNotification("Shared configuration loaded successfully!");
}

/**
 * Show a modal dialog with the share link
 * @param {string} url - The URL to display
 */

/**
 * Show a modal dialog with the share link
 * @param {string} url - The URL to display
 */
function showShareLink(url) {
  // Remove any existing share modals
  document.querySelectorAll('.share-modal').forEach(el => el.remove());
  
  // Create a modal dialog with the URL
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML = `
    <div class="share-modal-content">
      <h3>Share Link</h3>
      <p>Copy this link to share your configuration and content:</p>
      <input type="text" value="${url}" readonly onclick="this.select();">
      <div class="modal-actions">
        <button id="copy-share-link" class="btn btn-primary">Copy to Clipboard</button>
        <button class="btn btn-secondary" onclick="this.parentNode.parentNode.parentNode.remove()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Auto-select the input text for easy copying
  setTimeout(() => {
    const input = modal.querySelector('input');
    input.select();
  }, 100);
  
  // Add click handler for copy button
  modal.querySelector('#copy-share-link').addEventListener('click', () => {
    const input = modal.querySelector('input');
    input.select();
    navigator.clipboard.writeText(input.value)
      .then(() => {
        showNotification("Link copied to clipboard!");
      })
      .catch(err => {
        console.error("Failed to copy:", err);
        showNotification("Failed to copy link. Please select and copy manually.", "error");
      });
  });
}

/**
 * Show a notification message
 * @param {string} message - The message to display
 * @param {string} type - The notification type (default, error, processing)
 * @param {boolean} autoRemove - Whether to auto-remove the notification
 * @returns {HTMLElement} The notification element
 */
function showNotification(message, type = 'default', autoRemove = true) {
  // Remove any existing notification with the same type
  document.querySelectorAll(`.notification.notification-${type}`).forEach(el => el.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  if (type === 'processing') {
    notification.innerHTML = `
      <div class="notification-spinner"></div>
      <span>${message}</span>
    `;
  } else {
    notification.textContent = message;
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after a few seconds if requested
  if (autoRemove) {
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 5000);
  }
  
  return notification;
}

/**
 * Calculate Shannon entropy
 * @param {string} data - Input string
 * @returns {number} Entropy value
 */
function shannonEntropy(data) {
  if (!data || data.length === 0) {
    return 0;
  }
  
  const charCounts = {};
  
  // Count occurrences of each character
  for (const char of data) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  
  // Calculate entropy
  let entropy = 0;
  const length = data.length;
  
  for (const char in charCounts) {
    const freq = charCounts[char] / length;
    entropy -= freq * Math.log2(freq);
  }
  
  return entropy;
}

/**
 * Updates the wizard fields based on the selected rule type
 */
function updateWizardFields() {
  const ruleType = document.getElementById('ruleType').value;
  
  if (ruleType === "semi") {
    document.getElementById('semiFields').style.display = 'block';
    document.getElementById('uniqueFields').style.display = 'none';
  } else {
    document.getElementById('semiFields').style.display = 'none';
    document.getElementById('uniqueFields').style.display = 'block';
  }
  
  updateCaptureTypeDisplay();
  updateGeneratedRule();
}


/** 
* Creates and shows a loading overlay while shared content is being loaded
*/
function showLoadingOverlay() {
 // Add a class to the body to hide content during loading
 document.body.classList.add('content-loading');
 
 // Create the loading overlay
 const overlay = document.createElement('div');
 overlay.className = 'loading-overlay';
 overlay.innerHTML = `
   <div class="loading-spinner"></div>
   <div class="loading-message">Loading shared configuration...</div>
 `;
 
 // Add to the DOM
 document.body.appendChild(overlay);
 
 // Store a reference to remove it later
 window.loadingOverlay = overlay;
}

/**
* Removes the loading overlay and shows the content
*/
function hideLoadingOverlay() {
 // If we have a loading overlay, remove it gracefully
 if (window.loadingOverlay) {
   // Fade out
   window.loadingOverlay.style.opacity = '0';
   
   // Remove the loading class to show content
   document.body.classList.remove('content-loading');
   
   // Remove from DOM after animation completes
   setTimeout(() => {
     if (window.loadingOverlay && window.loadingOverlay.parentNode) {
       window.loadingOverlay.parentNode.removeChild(window.loadingOverlay);
     }
     window.loadingOverlay = null;
     
     // Refresh CodeMirror editors to ensure proper rendering
     if (editor) editor.refresh();
     if (configEditor) configEditor.refresh();
   }, 300);
 }
}

/**
 * Add character counter to bottom right of the editor
 * This will show the number of characters selected or current cursor position
 */
function addCharacterCounter() {
  // Create character counter element
  const counterElement = document.createElement('div');
  counterElement.className = 'char-counter';
  counterElement.innerHTML = 'Pos: 0:0 | Sel: 0';
  
  // Find the editor container and append counter
  const editorContainer = document.querySelector('.editor-container');
  editorContainer.style.position = 'relative';
  editorContainer.appendChild(counterElement);
  
  // Add event listeners to update the counter
  editor.on('cursorActivity', function() {
    updateCharCounter(editor, counterElement);
  });
  
  // Initial update
  updateCharCounter(editor, counterElement);
}

/**
 * Update the character counter with current selection or cursor info
 * @param {CodeMirror} cm - The CodeMirror instance
 * @param {HTMLElement} counterElement - The counter element to update
 */
function updateCharCounter(cm, counterElement) {
  const selection = cm.getSelection();
  const cursor = cm.getCursor();
  
  let message = `Pos: ${cursor.line + 1}:${cursor.ch + 1}`;
  
  if (selection && selection.length > 0) {
    message += ` | Sel: ${selection.length}`;
    
    // If selected text is longer than 3 characters, calculate and show entropy
    if (selection.length > 3) {
      const entropy = shannonEntropy(selection).toFixed(2);
      message += ` | Entropy: ${entropy}`;
    }
  } else {
    message += ` | Sel: 0`;
  }
  
  counterElement.innerHTML = message;
}
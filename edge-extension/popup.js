// State management
let state = {
  followers: [],
  following: [],
  notFollowingBack: [],
  fans: [],
  currentTab: 'not-following'
};

// DOM Elements
const analyzeBtn = document.getElementById('analyze-btn');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsSection = document.getElementById('results-section');
const notOnInstagram = document.getElementById('not-on-instagram');
const mainContent = document.getElementById('main-content');
const userList = document.getElementById('user-list');
const searchInput = document.getElementById('search-input');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const tabs = document.querySelectorAll('.tab');
const logOutput = document.getElementById('log-output');

// Logging function
function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const logLine = document.createElement('div');
  logLine.className = `log-line ${type}`;
  logLine.innerHTML = `<span class="timestamp">[${time}]</span>${message}`;
  logOutput.appendChild(logLine);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLogs() {
  logOutput.innerHTML = '';
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check if we're on Instagram
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url || !tab.url.includes('instagram.com')) {
    notOnInstagram.classList.remove('hidden');
    mainContent.classList.add('hidden');
    return;
  }

  // Load cached data if available
  const cached = await chrome.storage.local.get(['igFollowerData']);
  if (cached.igFollowerData) {
    state = { ...state, ...cached.igFollowerData };
    showResults();
  }
});

// Event Listeners
analyzeBtn.addEventListener('click', startAnalysis);
searchInput.addEventListener('input', filterUsers);
exportBtn.addEventListener('click', exportData);
clearBtn.addEventListener('click', clearData);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.currentTab = tab.dataset.tab;
    renderUserList();
  });
});

// Inject content script if not already injected
async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (response && response.status === 'ok') {
      return true;
    }
  } catch (e) {
    addLog('Content script not found, injecting...', 'info');
  }
  
  // Content script not loaded, inject it
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    addLog('Content script injected', 'success');
    // Wait a bit for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (injectError) {
    console.error('Failed to inject content script:', injectError);
    addLog(`Injection failed: ${injectError.message}`, 'error');
    return false;
  }
}

async function startAnalysis() {
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span class="spinner"></span>Analyzing...';
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  clearLogs();
  
  addLog('Starting analysis...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    addLog(`Current URL: ${tab.url}`, 'info');
    
    // Make sure content script is loaded
    addLog('Checking content script...', 'info');
    const scriptReady = await ensureContentScript(tab.id);
    if (!scriptReady) {
      throw new Error('Could not load content script. Please refresh the Instagram page and try again.');
    }
    addLog('Content script ready ✓', 'success');
    
    // Send message to content script to start analysis
    addLog('Sending start command...', 'info');
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startAnalysis' });
    
    if (response && response.error) {
      throw new Error(response.error);
    }
    
    addLog('Analysis running in background...', 'success');
    updateProgress(5, 'Analysis started...');

    // Start polling for progress updates
    lastLogMessage = '';
    pollProgress(tab.id);
    
  } catch (error) {
    console.error('Analysis failed:', error);
    addLog(`Error: ${error.message}`, 'error');
    updateProgress(0, `Error: ${error.message}`);
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '🔍 Analyze Followers';
  }
}

let lastLogMessage = '';

async function pollProgress(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getProgress' });
    
    // Log new messages
    if (response.message && response.message !== lastLogMessage) {
      lastLogMessage = response.message;
      const logType = response.message.includes('Error') ? 'error' : 
                      response.message.includes('complete') ? 'success' : 'info';
      addLog(response.message, logType);
    }
    
    if (response.status === 'complete') {
      state.followers = response.followers || [];
      state.following = response.following || [];
      
      addLog(`Found ${state.followers.length} followers`, 'success');
      addLog(`Found ${state.following.length} following`, 'success');
      
      // Calculate not following back and fans
      const followersSet = new Set(state.followers.map(f => f.username));
      const followingSet = new Set(state.following.map(f => f.username));
      
      state.notFollowingBack = state.following.filter(f => !followersSet.has(f.username));
      state.fans = state.followers.filter(f => !followingSet.has(f.username));
      
      addLog(`${state.notFollowingBack.length} not following back`, 'info');
      addLog(`${state.fans.length} fans you don't follow`, 'info');
      
      // Cache the data - strip base64 images to avoid quota exceeded error
      const stripProfilePics = (users) => users.map(u => ({
        username: u.username,
        fullName: u.fullName,
        isVerified: u.isVerified,
        userId: u.userId,
        // Only keep URL, not base64 (base64 is too large for storage)
        profilePic: u.profilePic && !u.profilePic.startsWith('data:') ? u.profilePic : null
      }));
      
      try {
        await chrome.storage.local.set({ 
          igFollowerData: {
            followers: stripProfilePics(state.followers),
            following: stripProfilePics(state.following),
            notFollowingBack: stripProfilePics(state.notFollowingBack),
            fans: stripProfilePics(state.fans),
            lastUpdated: new Date().toISOString()
          }
        });
        addLog('Data cached successfully', 'success');
      } catch (storageError) {
        console.warn('Could not cache data:', storageError);
        addLog('Warning: Could not cache data (storage full)', 'info');
      }
      
      addLog('Analysis complete! ✓', 'success');
      showResults();
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '🔍 Analyze Again';
      
    } else if (response.status === 'error') {
      throw new Error(response.message);
    } else {
      updateProgress(response.progress, response.message);
      setTimeout(() => pollProgress(tabId), 500);
    }
  } catch (error) {
    console.error('Poll error:', error);
    addLog(`Poll error: ${error.message}`, 'error');
    updateProgress(0, `Error: ${error.message}`);
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '🔍 Analyze Followers';
  }
}

function updateProgress(percent, message) {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${Math.round(percent)}% - ${message}`;
}

function showResults() {
  progressSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  document.getElementById('followers-count').textContent = state.followers.length;
  document.getElementById('following-count').textContent = state.following.length;
  document.getElementById('not-following-back-count').textContent = state.notFollowingBack.length;
  
  renderUserList();
}

function renderUserList() {
  const list = state.currentTab === 'not-following' ? state.notFollowingBack : state.fans;
  const searchTerm = searchInput.value.toLowerCase();
  const filtered = list.filter(u => u.username.toLowerCase().includes(searchTerm));
  
  if (filtered.length === 0) {
    userList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">${state.currentTab === 'not-following' ? '🎉' : '👀'}</div>
        <p>${searchTerm ? 'No users found' : (state.currentTab === 'not-following' ? 'Everyone follows you back!' : 'No fans yet')}</p>
      </div>
    `;
    return;
  }
  
  userList.innerHTML = filtered.map(user => {
    const initial = user.username.charAt(0).toUpperCase();
    const hasValidPic = user.profilePic && (user.profilePic.startsWith('data:') || user.profilePic.startsWith('http'));
    
    return `
    <div class="user-item">
      ${hasValidPic 
        ? `<img src="${user.profilePic}" class="user-avatar-img" onerror="this.outerHTML='<div class=\\'user-avatar\\'>${initial}</div>'" />`
        : `<div class="user-avatar">${initial}</div>`
      }
      <div class="user-info">
        <div class="user-name">@${user.username}${user.isVerified ? '<span class="verified">✓</span>' : ''}</div>
        ${user.fullName ? `<div class="user-fullname">${user.fullName}</div>` : ''}
        <a href="https://instagram.com/${user.username}" target="_blank" class="user-link">View Profile →</a>
      </div>
    </div>
  `}).join('');
}

function filterUsers() {
  renderUserList();
}

function exportData() {
  const list = state.currentTab === 'not-following' ? state.notFollowingBack : state.fans;
  const title = state.currentTab === 'not-following' ? 'Not Following Back' : 'Fans You Don\'t Follow';
  
  let content = `Instagram ${title} Report\n`;
  content += `Generated: ${new Date().toLocaleString()}\n`;
  content += `Total: ${list.length} users\n`;
  content += '='.repeat(50) + '\n\n';
  
  list.forEach(user => {
    content += `@${user.username}\n`;
    content += `  URL: https://instagram.com/${user.username}\n\n`;
  });
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instagram_${state.currentTab.replace('-', '_')}_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearData() {
  if (confirm('Clear all cached data?')) {
    await chrome.storage.local.remove('igFollowerData');
    state = {
      followers: [],
      following: [],
      notFollowingBack: [],
      fans: [],
      currentTab: 'not-following'
    };
    resultsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    analyzeBtn.innerHTML = '🔍 Analyze Followers';
  }
}

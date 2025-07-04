// --- UI Elements ---
const signInBtn = document.getElementById('sign-in-btn');
const mainUI = document.getElementById('main-ui');
const authSection = document.getElementById('auth-section');
const meetingSelect = document.getElementById('meeting-select');
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const speechToggle = document.getElementById('speech-toggle');
const googleSignInBtn = document.getElementById('google-signin-btn');
const userInfoDiv = document.getElementById('user-info');
const userNameSpan = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const uiToggle = document.getElementById('ui-toggle');
const activateMessage = document.getElementById('activate-message');
const pluginToggleMessage = document.getElementById('plugin-toggle-message');

// --- State ---
let signedIn = false;
let meetings = [];
let selectedMeeting = null;
let speechReplies = false;
let isRecording = false;

// --- Login Form Elements (dynamically created) ---
let loginForm, emailInput, passwordInput, loginError;

function showLoginForm() {
  // Remove existing form if present
  if (loginForm) loginForm.remove();
  
  loginForm = document.createElement('div');
  loginForm.id = 'login-form';
  loginForm.innerHTML = `
    <div class="form-group">
      <input type="email" id="login-email" class="form-input" placeholder="Email" required />
    </div>
    <div class="form-group">
      <input type="password" id="login-password" class="form-input" placeholder="Password" required />
    </div>
    <button type="submit" id="login-submit" class="btn-primary">Sign In</button>
    <div id="login-error" class="hidden"></div>
  `;
  
  // Insert after the Google sign-in button
  googleSignInBtn.insertAdjacentElement('afterend', loginForm);
  
  emailInput = loginForm.querySelector('#login-email');
  passwordInput = loginForm.querySelector('#login-password');
  loginError = loginForm.querySelector('#login-error');
  
  const loginSubmitBtn = loginForm.querySelector('#login-submit');
  loginSubmitBtn.addEventListener('click', handleLoginSubmit);
  
  // Add enter key support
  [emailInput, passwordInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLoginSubmit(e);
    });
  });
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  loginError.classList.add('hidden');
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }
  
  // Show loading state
  const submitBtn = loginForm.querySelector('#login-submit');
  const originalText = submitBtn.textContent;
  submitBtn.innerHTML = '<div class="loading"></div>';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('http://127.0.0.1:8000/checklogin/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      signedIn = true;
      chrome.storage.local.set({ signedIn: true });
      if (loginForm) loginForm.remove();
      showUserInfo(data.name);
      showMainUI();
      mockFetchMeetings();
    } else {
      showError(data.error || 'Login failed.');
    }
  } catch (err) {
    showError('Network error. Please try again.');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove('hidden');
}

function mockFetchMeetings() {
  // Simulate fetching meetings from backend
  meetings = [
    { id: '1', title: 'Team Sync - Monday' },
    { id: '2', title: 'Project Kickoff' },
    { id: '3', title: '1:1 with Manager' }
  ];
  populateMeetings();
}

function mockAssistantReply(message) {
  // Simulate assistant reply with more realistic responses
  const responses = [
    `I understand you're asking about "${message}". Let me help you with that regarding your ${selectedMeeting ? selectedMeeting.title : 'selected meeting'}.`,
    `Great question about "${message}". Based on your meeting context, here's what I can tell you...`,
    `Thanks for your question about "${message}". I'll analyze this in the context of your ${selectedMeeting ? selectedMeeting.title : 'meeting'}.`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// --- UI Logic ---
function showMainUI() {
  authSection.classList.add('hidden');
  mainUI.classList.remove('hidden');
}

function showSignIn() {
  authSection.classList.remove('hidden');
  mainUI.classList.add('hidden');
  if (loginForm) loginForm.remove();
}

function populateMeetings() {
  meetingSelect.innerHTML = '<option value="">Select a meeting...</option>';
  meetings.forEach(meeting => {
    const option = document.createElement('option');
    option.value = meeting.id;
    option.textContent = meeting.title;
    meetingSelect.appendChild(option);
  });
}

meetingSelect.addEventListener('change', () => {
  selectedMeeting = meetings.find(m => m.id === meetingSelect.value);
  if (selectedMeeting) {
    appendMessage('system', `Switched to meeting: ${selectedMeeting.title}`);
  }
});

// --- Chat Logic ---
function appendMessage(sender, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender === 'You' ? 'user' : sender === 'system' ? 'system' : 'assistant'}`;
  
  if (sender === 'system') {
    messageDiv.style.background = '#e2e8f0';
    messageDiv.style.color = '#4a5568';
    messageDiv.style.textAlign = 'center';
    messageDiv.style.fontStyle = 'italic';
    messageDiv.style.margin = '8px auto';
    messageDiv.style.maxWidth = '90%';
  }
  
  messageDiv.textContent = sender === 'system' ? text : `${sender === 'You' ? '' : 'Assistant: '}${text}`;
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function handleSend() {
  const message = userInput.value.trim();
  if (!message) return;
  
  if (!selectedMeeting) {
    appendMessage('system', 'Please select a meeting first.');
    return;
  }
  
  appendMessage('You', message);
  userInput.value = '';
  
  // Show typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message assistant';
  typingDiv.innerHTML = 'Assistant is typing... <div class="loading"></div>';
  chatArea.appendChild(typingDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  // Simulate assistant reply with delay
  setTimeout(() => {
    chatArea.removeChild(typingDiv);
    const reply = mockAssistantReply(message);
    appendMessage('Assistant', reply);
    if (speechReplies) speak(reply);
  }, 1000 + Math.random() * 2000);
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSend();
});

// --- Speech Recognition (Web Speech API) ---
let recognition;
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = function() {
    isRecording = true;
    micBtn.classList.add('recording');
    micBtn.title = 'Recording... Click to stop';
  };

  recognition.onend = function() {
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.title = 'Voice input';
  };

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    handleSend();
  };
  
  recognition.onerror = function(event) {
    isRecording = false;
    micBtn.classList.remove('recording');
    appendMessage('system', `Speech recognition error: ${event.error}`);
  };
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    appendMessage('system', 'Speech recognition not supported in this browser.');
    return;
  }
  
  if (isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

// --- Speech Synthesis (Replies) ---
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

// --- Speech Toggle Logic ---
speechToggle.addEventListener('click', () => {
  speechReplies = !speechReplies;
  speechToggle.classList.toggle('active', speechReplies);
  chrome.storage.local.set({ speechReplies });
});

// --- Sign In Button ---
signInBtn.addEventListener('click', showLoginForm);

// --- Google Sign-In Button ---
if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', () => {
    // Replace with your backend's Google OAuth login URL
    const googleLoginUrl = 'http://127.0.0.1:8000/accounts/google/login/';
    chrome.tabs.create({ url: googleLoginUrl });
  });
}

// --- User Info Logic ---
async function fetchUserInfo() {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/userinfo/', {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (e) {
    console.error('Error fetching user info:', e);
  }
  return null;
}

function showUserInfo(name) {
  userNameSpan.textContent = name;
  userInfoDiv.style.display = 'flex';
}

function hideUserInfo() {
  userInfoDiv.style.display = 'none';
  userNameSpan.textContent = '';
}

// --- Logout Logic ---
async function handleLogout() {
  try {
    await fetch('http://127.0.0.1:8000/signout/', {
      credentials: 'include'
    });
  } catch (e) {
    console.error('Error during logout:', e);
  }
  
  chrome.storage.local.set({ signedIn: false });
  hideUserInfo();
  if (loginForm) loginForm.remove();
  showSignIn();
  chatArea.innerHTML = '';
  meetingSelect.innerHTML = '';
  selectedMeeting = null;
  
  // Broadcast logout to all chatbot web UI tabs
  broadcastLogoutToChatbotTabs();
}

// Broadcast logout to all open tabs of the chatbot web UI
function broadcastLogoutToChatbotTabs() {
  chrome.runtime.sendMessage({ type: 'BROADCAST_LOGOUT' });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', handleLogout);
}

// --- Initialization ---
function setUIState(active) {
  document.body.classList.toggle('ui-inactive', !active);
  uiToggle.classList.toggle('active', active);
  uiToggle.classList.toggle('inactive', !active);
  chrome.storage.local.set({ uiActive: active });
  if (activateMessage) activateMessage.style.display = active ? 'none' : 'block';
  if (pluginToggleMessage) {
    pluginToggleMessage.style.display = 'block';
    pluginToggleMessage.textContent = active ? 'Disable Plugin' : 'Activate Plugin';
  }
}

uiToggle.addEventListener('click', () => {
  const isActive = uiToggle.classList.contains('active');
  setUIState(!isActive);
});

async function init() {
  chrome.storage.local.get(['signedIn', 'speechReplies', 'uiActive'], async (result) => {
    const uiActive = result.uiActive !== false; // default to true
    setUIState(uiActive);
    speechReplies = !!result.speechReplies;
    if (speechToggle) speechToggle.classList.toggle('active', speechReplies);
    if (!uiActive) return;
    const user = await fetchUserInfo();
    if (user && user.name) {
      signedIn = true;
      chrome.storage.local.set({ signedIn: true });
      showUserInfo(user.name);
      showMainUI();
      mockFetchMeetings();
    } else {
      signedIn = false;
      chrome.storage.local.set({ signedIn: false });
      hideUserInfo();
      showSignIn();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
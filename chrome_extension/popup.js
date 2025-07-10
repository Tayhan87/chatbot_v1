// --- Configuration ---
const API_CONFIG = {
  BASE_URL: "http://127.0.0.1:8000",
  get CHECK_LOGIN_URL() {
    return `${this.BASE_URL}/checklogin/`;
  },
  get CHAT_API_URL() {
    return `${this.BASE_URL}/chat_api/`;
  },
  get GOOGLE_LOGIN_URL() {
    return `${this.BASE_URL}/accounts/google/login/`;
  },
  get USER_INFO_URL() {
    return `${this.BASE_URL}/api/userinfo/`;
  },
  get SIGNOUT_URL() {
    return `${this.BASE_URL}/signout/`;
  },
  get MEETINGS_URL() {
    return `${this.BASE_URL}/showmeeting/`;
  },
};

// --- UI Elements ---
const signInBtn = document.getElementById("sign-in-btn");
const mainUI = document.getElementById("main-ui");
const authSection = document.getElementById("auth-section");
const meetingSelect = document.getElementById("meeting-select");
const chatArea = document.getElementById("chat-area");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const speechToggle = document.getElementById("speech-toggle");
const googleSignInBtn = document.getElementById("google-signin-btn");
const userInfoDiv = document.getElementById("user-info");
const userNameSpan = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
const uiToggle = document.getElementById("ui-toggle");
const activateMessage = document.getElementById("activate-message");
const pluginToggleMessage = document.getElementById("plugin-toggle-message");
const stopVoiceBtn = document.getElementById('stop-voice-btn');
if (stopVoiceBtn) {
  stopVoiceBtn.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });
}

const resetChatBtn = document.getElementById('reset-chat-btn');
if (resetChatBtn) {
  resetChatBtn.addEventListener('click', () => {
    chatArea.innerHTML = '<div class="message system" style="background:#e2e8f0;color:#4a5568;text-align:center;font-style:italic;margin:8px auto;max-width:90%;">Welcome to the AI Chat Assistant!</div>';
  });
}

// --- State ---
let meetings = [];
let selectedMeeting = null;
let speechReplies = false;
let isRecording = false;

// --- Login Form Elements (dynamically created) ---
let loginForm, emailInput, passwordInput, loginError;

async function loadMeetings() {
  console.log("Loading meetings...");
  try {
    const response = await fetch(API_CONFIG.MEETINGS_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
    });

    if (response.ok) {
      const data = await response.json();
      meetings = data.events; // or data.meetings, depending on your API

      // FIX: Call populateMeetings() with the new data from the API
      populateMeetings();
    } else {
      // FIX: Remove the fallback and just log an error
      console.error("Failed to fetch meetings. Status:", response.status);
      appendMessage(
        "system",
        "Error: Could not load meetings from the server."
      );
    }
  } catch (error) {
    // FIX: Remove the fallback and just log an error
    console.error("Network error while fetching meetings:", error);
    appendMessage("system", "Error: Unable to connect to the server.");
  }
}

/**
 * Gets the CSRF token from the document's cookies.
 * Required for making secure POST requests to a Django backend.
 * @returns {string} The CSRF token, or an empty string if not found.
 */
function getCSRFToken() {
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];
  return cookieValue || "";
}

function showLoginForm() {
  if (loginForm) loginForm.remove();

  loginForm = document.createElement("div");
  loginForm.id = "login-form";
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

  googleSignInBtn.insertAdjacentElement("afterend", loginForm);

  emailInput = loginForm.querySelector("#login-email");
  passwordInput = loginForm.querySelector("#login-password");
  loginError = loginForm.querySelector("#login-error");

  const loginSubmitBtn = loginForm.querySelector("#login-submit");
  loginSubmitBtn.addEventListener("click", handleLoginSubmit);

  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLoginSubmit(e);
    });
  });
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  loginError.classList.add("hidden");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Please enter both email and password.");
    return;
  }

  const submitBtn = loginForm.querySelector("#login-submit");
  const originalText = submitBtn.textContent;
  submitBtn.innerHTML = '<div class="loading"></div>';
  submitBtn.disabled = true;

  try {
    const response = await fetch(API_CONFIG.CHECK_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      chrome.storage.local.set({ signedIn: true });
      if (loginForm) loginForm.remove();
      showUserInfo(data.name);
      showMainUI();
      loadMeetings();
    } else {
      showError(data.error || "Login failed. Please check your credentials.");
    }
  } catch (err) {
    showError("Network error. Could not connect to the server.");
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function showError(message) {
  if (loginError) {
    loginError.textContent = message;
    loginError.classList.remove("hidden");
  }
}

// NOTE: This is a mock function. Replace with a real API call.
async function fetchMeetings() {
  // Replace this with: const response = await fetch(API_CONFIG.MEETINGS_URL);
  // meetings = await response.json();
  meetings = [
    { id: "1", title: "Team Sync - Tuesday" },
    { id: "2", title: "Project Kickoff" },
    { id: "3", title: "1:1 with Manager" },
  ];
  populateMeetings();
}

async function callAPI(message) {
  try {
    const response = await fetch(API_CONFIG.CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data.response || data.message || "No response received";
  } catch (error) {
    console.error("API Call Error:", error);
    return "Sorry, I encountered an error. Please try again.";
  }
}

// --- UI Logic ---
function showMainUI() {
  authSection.classList.add("hidden");
  mainUI.classList.remove("hidden");
}

function showSignIn() {
  authSection.classList.remove("hidden");
  mainUI.classList.add("hidden");
  if (loginForm) loginForm.remove();
}

function populateMeetings() {
  meetingSelect.innerHTML = '<option value="">Select a meeting...</option>';
  meetings.forEach((meeting) => {
    const option = document.createElement("option");
    option.value = meeting.id;
    option.textContent = meeting.title;
    console.log("Adding meeting option:", option.textContent);
    meetingSelect.appendChild(option);
  });
}

// Change the meetingSelect event listener
meetingSelect.addEventListener("change", () => {
  // Use toString() for consistent type comparison
  selectedMeeting = meetings.find(
    (m) => m.id.toString() === meetingSelect.value
  );

  if (selectedMeeting) {
    appendMessage("system", `Switched to meeting: ${selectedMeeting.title}`);
  }
});

// --- Chat Logic ---
function appendMessage(sender, text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${
    sender === "You" ? "user" : sender === "system" ? "system" : "assistant"
  }`;

  if (sender === "system") {
    messageDiv.style.cssText =
      "background: #e2e8f0; color: #4a5568; text-align: center; font-style: italic; margin: 8px auto; max-width: 90%;";
  }

  messageDiv.textContent =
    sender === "system"
      ? text
      : `${sender === "You" ? "" : "Assistant: "}${text}`;
  chatArea.appendChild(messageDiv);
  // Automatic scroll to bottom
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function handleSend() {
  const message = userInput.value.trim();
  if (!message) return;

  if (!selectedMeeting) {
    appendMessage("system", "Please select a meeting first.");
    return;
  }

  appendMessage("You", message);
  userInput.value = "";
  sendBtn.disabled = true;

  const typingDiv = document.createElement("div");
  typingDiv.className = "message assistant";
  typingDiv.innerHTML = 'Assistant is typing... <div class="loading"></div>';
  chatArea.appendChild(typingDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  const reply = await callAPI(message);

  chatArea.removeChild(typingDiv);
  appendMessage("Assistant", reply);
  sendBtn.disabled = false;

  if (speechReplies) {
    speak(reply);
  }
}

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
});

// --- Speech Recognition (Web Speech API) ---
let recognition;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.title = "Recording... Click to stop";
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.title = "Voice input";
  };

  recognition.onresult = (event) => {
    userInput.value = event.results[0][0].transcript;
    handleSend();
  };

  recognition.onerror = (event) => {
    appendMessage("system", `Speech recognition error: ${event.error}`);
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    return appendMessage(
      "system",
      "Speech recognition not supported in this browser."
    );
  }
  isRecording ? recognition.stop() : recognition.start();
});

// --- Speech Synthesis ---
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.9;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

speechToggle.addEventListener("click", () => {
  speechReplies = !speechReplies;
  speechToggle.classList.toggle("active", speechReplies);
  chrome.storage.local.set({ speechReplies });
});

// --- Authentication and User Info ---
signInBtn.addEventListener("click", showLoginForm);

if (googleSignInBtn) {
  googleSignInBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: API_CONFIG.GOOGLE_LOGIN_URL });
  });
}

async function fetchUserInfo() {
  try {
    const response = await fetch(API_CONFIG.USER_INFO_URL, {
      credentials: "include",
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.error("Error fetching user info:", e);
  }
  return null;
}

function showUserInfo(name) {
  userNameSpan.textContent = name;
  userInfoDiv.style.display = "flex";
}

function hideUserInfo() {
  userInfoDiv.style.display = "none";
  userNameSpan.textContent = "";
}

async function handleLogout() {
  try {
    await fetch(API_CONFIG.SIGNOUT_URL, { credentials: "include" });
  } catch (e) {
    console.error("Error during logout:", e);
  }

  chrome.storage.local.set({ signedIn: false });
  hideUserInfo();
  showSignIn();
  chatArea.innerHTML = "";
  meetingSelect.innerHTML = '<option value="">Select a meeting...</option>';
  selectedMeeting = null;

  broadcastLogoutToChatbotTabs();
}

function broadcastLogoutToChatbotTabs() {
  chrome.runtime.sendMessage({ type: "BROADCAST_LOGOUT" });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", handleLogout);
}

// --- Initialization and UI Toggling ---
function setUIState(active) {
  document.body.classList.toggle("ui-inactive", !active);
  uiToggle.classList.toggle("active", active);
  uiToggle.classList.toggle("inactive", !active);

  if (activateMessage)
    activateMessage.style.display = active ? "none" : "block";
  if (pluginToggleMessage) {
    pluginToggleMessage.textContent = active
      ? "Disable Plugin"
      : "Activate Plugin";
  }
}

uiToggle.addEventListener("click", () => {
  const isActive = !uiToggle.classList.contains("inactive");
  setUIState(!isActive);
  chrome.storage.local.set({ uiActive: !isActive });
});

async function init() {
  const result = await chrome.storage.local.get([
    "signedIn",
    "speechReplies",
    "uiActive",
  ]);

  const uiActive = result.uiActive !== false; // Default to true
  setUIState(uiActive);

  speechReplies = !!result.speechReplies;
  if (speechToggle) speechToggle.classList.toggle("active", speechReplies);

  if (!uiActive) return;

  const user = await fetchUserInfo();
  if (user && user.name) {
    showUserInfo(user.name);
    showMainUI();
    loadMeetings();
  } else {
    hideUserInfo();
    showSignIn();
  }
}

document.addEventListener("DOMContentLoaded", init);

async function summarizeSelectedMeeting() {
  const meetingId = meetingSelect.value;
  if (!meetingId) {
    appendMessage('system', 'Please select a meeting to summarize.');
    return;
  }
  // Fetch all meetings and find the selected one
  try {
    const response = await fetch('http://127.0.0.1:8000/showmeeting/');
    const data = await response.json();
    const meeting = (data.events || []).find(m => m.id == meetingId);
    if (!meeting) {
      appendMessage('system', 'Meeting not found.');
      return;
    }
    // Show meeting details in chat
    const details = `Meeting Details:\n- Title: ${meeting.title}\n- Date: ${meeting.date}\n- Time: ${meeting.time}\n- Description: ${meeting.description || ''}\n- Link: ${meeting.link || ''}\n- Folder: ${meeting.folder || ''}`;
    appendMessage('system', details);
    const summaryPrompt = `Summarize the following meeting in a professional, point-by-point format.\n\n${details}\n\nPlease provide the summary as a numbered or bulleted list of key points.`;
    appendMessage('You', 'Summarize the selected meeting.');
    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.innerHTML = 'Assistant is typing... <div class="loading"></div>';
    chatArea.appendChild(typingDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    // Simulate assistant reply with delay and call AI API
    try {
      const aiResponse = await fetch('http://127.0.0.1:8000/chat_api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: summaryPrompt })
      });
      const aiData = await aiResponse.json();
      chatArea.removeChild(typingDiv);
      appendMessage('Assistant', aiData.response || aiData.message || 'No summary received.');
    } catch (err) {
      chatArea.removeChild(typingDiv);
      appendMessage('system', 'Sorry, I could not summarize the meeting.');
    }
  } catch (err) {
    appendMessage('system', 'Failed to fetch meetings.');
  }
}

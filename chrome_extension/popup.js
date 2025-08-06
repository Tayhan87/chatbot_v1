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
const googleSignInBtn = document.getElementById("google-signin-btn");
const userInfoDiv = document.getElementById("user-info");
const userNameSpan = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
const driveToggle = document.getElementById("drive-toggle");
const meetingToggle = document.getElementById("meeting-toggle");
const speechToggle = document.getElementById("speech-toggle");

// --- State ---
let meetings = [];
let selectedMeeting = null;
let speechReplies = true;
let isRecording = false;
let isDriveMode = true;

// --- Login Form Elements (dynamically created) ---
let loginForm, emailInput, passwordInput, loginError;

// --- Core Functions ---
async function loadMeetings() {
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
      meetings = data.events;
      populateMeetings();
    } else {
      appendMessage("system", "Error: Could not load meetings.");
    }
  } catch (error) {
    appendMessage("system", "Error: Unable to connect to the server.");
  }
}

function getCSRFToken() {
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];
  return cookieValue || "";
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
  // Simplified login logic
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
      showError(data.error || "Login failed.");
    }
  } catch (err) {
    showError("Network error.");
  }
}

async function callAPI(message, folder) {
  try {
    const response = await fetch(API_CONFIG.CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify({ message, folder }),
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    return data.response || data.message || "No response received";
  } catch (error) {
    console.error("API Call Error:", error);
    return "Sorry, an error occurred.";
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
    meetingSelect.appendChild(option);
  });
}

function appendMessage(sender, text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender.toLowerCase()}`;
  messageDiv.textContent = text;
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// --- Event Handlers ---
function handleSend() {
  const message = userInput.value.trim();
  if (!message) return;
  userInput.value = "";
  processRequest(message);
}

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
});

meetingSelect.addEventListener("change", () => {
  selectedMeeting = meetings.find(
    (m) => m.id.toString() === meetingSelect.value
  );
  if (selectedMeeting) {
    appendMessage("system", `Switched to meeting: ${selectedMeeting.title}`);
  }
});

// --- Speech Recognition ---
let recognition;
if ("webkitSpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add("recording");
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove("recording");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    userInput.focus();
    //processRequest(transcript);
  };

  recognition.onerror = (event) => {
    appendMessage("system", `Speech error: ${event.error}`);
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition)
    return appendMessage("system", "Speech recognition not supported.");
  isRecording ? recognition.stop() : recognition.start();
});

async function processRequest(text) {
  if (!selectedMeeting) {
    appendMessage("system", "Please select a meeting first.");
    return;
  }
  appendMessage("User", text);

  sendBtn.disabled = true;
  micBtn.disabled = true;
  const typingDiv = document.createElement("div");
  typingDiv.className = "message assistant";
  typingDiv.innerHTML = '<div class="loading"></div>';
  chatArea.appendChild(typingDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  const reply = await callAPI(text, selectedMeeting.folder);

  chatArea.removeChild(typingDiv);
  appendMessage("Assistant", reply);
  sendBtn.disabled = false;
  micBtn.disabled = false;

  if (speechReplies) {
    speak(reply);
  }
}

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

// --- Toggle Logic ---
function handleToggleSwitch(activateMode) {
  isDriveMode = activateMode === "drive";
  driveToggle.classList.toggle("active", isDriveMode);
  meetingToggle.classList.toggle("active", !isDriveMode);
  // The functionality is now the same, so we only update the visual state and a system message.
  chrome.storage.local.set({ isDriveMode });
}

driveToggle.addEventListener("click", () => {
  if (!isDriveMode) handleToggleSwitch("drive");
});

meetingToggle.addEventListener("click", () => {
  if (isDriveMode) handleToggleSwitch("meeting");
});

speechToggle.addEventListener("click", () => {
  speechReplies = !speechReplies;
  speechToggle.classList.toggle("active", speechReplies);
  chrome.storage.local.set({ speechReplies });
});

// --- Authentication ---
// Simplified auth functions
function showLoginForm() {
  if (loginForm) loginForm.remove();
  loginForm = document.createElement("div");
  loginForm.id = "login-form";
  loginForm.innerHTML = `
    <input type="email" id="login-email" class="form-input" placeholder="Email" required />
    <input type="password" id="login-password" class="form-input" placeholder="Password" required />
    <button type="submit" id="login-submit" class="btn-primary">Sign In</button>
    <div id="login-error" class="hidden"></div>
  `;
  googleSignInBtn.insertAdjacentElement("afterend", loginForm);
  emailInput = loginForm.querySelector("#login-email");
  passwordInput = loginForm.querySelector("#login-password");
  loginError = loginForm.querySelector("#login-error");
  loginForm
    .querySelector("#login-submit")
    .addEventListener("click", handleLoginSubmit);
}
signInBtn.addEventListener("click", showLoginForm);
googleSignInBtn.addEventListener("click", () =>
  chrome.tabs.create({ url: API_CONFIG.GOOGLE_LOGIN_URL })
);

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
}
logoutBtn.addEventListener("click", handleLogout);

// --- Initialization ---
async function init() {
  const result = await chrome.storage.local.get([
    "signedIn",
    "isDriveMode",
    "speechReplies",
  ]);
  const user = await fetchUserInfo();
  if (user && user.name) {
    showUserInfo(user.name);
    showMainUI();
    await loadMeetings();

    isDriveMode = result.isDriveMode !== false;
    driveToggle.classList.toggle("active", isDriveMode);
    meetingToggle.classList.toggle("active", !isDriveMode);

    speechReplies = result.speechReplies !== false;
    speechToggle.classList.toggle("active", speechReplies);

    chatArea.innerHTML = "";
    appendMessage("system", `Welcome, ${user.name}! Please select a meeting.`);
  } else {
    hideUserInfo();
    showSignIn();
  }
}

document.addEventListener("DOMContentLoaded", init);

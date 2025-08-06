// background.js for Meeting Assistant Extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Meeting Assistant Extension installed.");
});

// Placeholder: Handle authentication and token refresh logic here in the future
// For now, all sign-in logic is handled in popup.js

// Placeholder: Listen for messages from popup.js for auth/token management
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_AUTH_STATE") {
    // Example: respond with auth state (to be implemented)
    chrome.storage.local.get(["signedIn", "authToken"], (result) => {
      sendResponse({
        signedIn: !!result.signedIn,
        authToken: result.authToken || null,
      });
    });
    return true; // Keep the message channel open for async response
  }
  if (request.type === "BROADCAST_LOGOUT") {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes("127.0.0.1:8000/chatbot")) {
          chrome.tabs.sendMessage(tab.id, { type: "FORCE_LOGOUT" });
        }
      });
    });
  }
  if (request.type === "MEETING_STATUS") {
    fetch("http://127.0.0.1:8000/api/meet-status/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        joined: request.joined,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error("Failed to send meeting status");
        }
      })
      .catch((err) => {
        console.error("Error sending meeting status:", err);
      });
  }

  // Add more message handlers as needed for integration
});

// Track Google Meet tab IDs
let googleMeetTabs = new Set();

// Listen for tab updates to track Google Meet sessions
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes("meet.google.com")) {
    googleMeetTabs.add(tabId);
  }
});

// Listen for tab removals (i.e. tab is closed)
chrome.tabs.onRemoved.addListener((tabId) => {
  if (googleMeetTabs.has(tabId)) {
    googleMeetTabs.delete(tabId);

    // Send false to /api/meet-status/
    fetch("http://127.0.0.1:8000/api/meet-status/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        joined: false,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error("Failed to send meeting status on tab close");
        }
      })
      .catch((err) => {
        console.error("Error sending status after tab closed:", err);
      });
  }
});

function notifyMeetingStatus(joined) {
  chrome.runtime.sendMessage({
    type: "MEETING_STATUS",
    joined: joined,
  });
}

// On tab load (user joined meeting)
notifyMeetingStatus(true);
console.log("✅ meetTracker.js is running");

// On tab close or navigation (user left meeting)
window.addEventListener("beforeunload", () => {
  notifyMeetingStatus(false);
});

class ChatInterface {
  constructor() {
    this.messageInput = document.getElementById("messageInput");
    this.chatMessages = document.getElementById("chatMessages");
    this.chatForm = document.getElementById("chatForm");
    this.logoutButton = document.getElementById("logoutButton");
    this.isRecording = false;
    this.recognition = null;
    this.init();
  }

  init() {
    if (this.chatForm) {
      this.chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.sendMessage();
      });
    }
    if (this.messageInput) {
      this.messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.messageInput.addEventListener("input", () => {
        this.messageInput.style.height = "auto";
        this.messageInput.style.height =
          Math.min(this.messageInput.scrollHeight, 120) + "px";
      });
    }
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => {
        this.handleLogout();
      });
    }
  }

  async handleLogout() {
    // Show confirmation dialog
    const confirmed = confirm("Are you sure you want to logout?");
    if (!confirmed) return;

    // window.location.href = document.getElementById("logouts").href; // Redirect to logout URL

    try {
      // Show loading state on logout button
      this.logoutButton.disabled = true;
      this.logoutButton.innerHTML = `
                        <div class="flex items-center space-x-2">
                            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full loading-spinner"></div>
                            <span>Logging out...</span>
                        </div>
                    `;

      // Make logout request to Django backend
      const response = await fetch("/signout/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCSRFToken(),
        },
      });

      if (response.ok) {
        // Redirect to login page or home page
        window.location.href = "/login/"; // Adjust this URL as needed
      } else {
        throw new Error("Logout failed");
      }
    } catch (error) {
      console.error("Logout error:", error);
      alert("Logout failed. Please try again.");

      // Restore logout button
      this.logoutButton.disabled = false;
      this.logoutButton.innerHTML = `
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 012 2v2h-2V4H4v16h10v-2h2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2h10z"/>
                        </svg>
                        <span>Logout</span>
                    `;
    }
  }

  initSpeechRecognition() {
    // Check if browser supports speech recognition
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isRecording = true;
        this.voiceButton.classList.add("voice-recording", "voice-listening");
        this.micIcon.classList.add("hidden");
        this.stopIcon.classList.remove("hidden");
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.messageInput.value = transcript;
        this.messageInput.focus();
        // Auto-resize textarea after voice input
        this.messageInput.style.height = "auto";
        this.messageInput.style.height =
          Math.min(this.messageInput.scrollHeight, 120) + "px";
      };

      this.recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        this.stopVoiceRecording();
        if (event.error === "not-allowed") {
          alert(
            "Microphone access denied. Please allow microphone access and try again."
          );
        } else {
          alert("Speech recognition error. Please try again.");
        }
      };

      this.recognition.onend = () => {
        this.stopVoiceRecording();
      };
    } else {
      // Hide voice button if not supported
      this.voiceButton.style.display = "none";
      console.warn("Speech recognition not supported in this browser");
    }
  }

  toggleVoiceInput() {
    if (!this.recognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        alert("Could not start voice recognition. Please try again.");
      }
    }
  }

  stopVoiceRecording() {
    this.isRecording = false;
    this.voiceButton.classList.remove("voice-recording", "voice-listening");
    this.micIcon.classList.remove("hidden");
    this.stopIcon.classList.add("hidden");
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;
    this.addMessage(message, "user");
    this.messageInput.value = "";
    this.messageInput.style.height = "auto";
    const sendButton = this.chatForm ? this.chatForm.querySelector('button[type="submit"]') : null;
    if (sendButton) sendButton.disabled = true;
    // Show typing bubble for AI
    const typingBubble = this.addMessage('', 'bot-typing');
    try {
      const response = await this.callAPI(message);
      console.log('AI API response:', response);
      // Remove typing bubble
      if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
      this.addMessage(response, "bot");
    } catch (error) {
      if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
      this.addMessage(
        "Sorry, I encountered an error. Please try again.",
        "error"
      );
    } finally {
      if (sendButton) sendButton.disabled = false;
      this.messageInput.focus();
    }
  }

  async callAPI(message) {
    const API_URL = "/chat_api/";
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.response || data.message || "No response received";
  }

  getCSRFToken() {
    // Get CSRF token from cookie or meta tag
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];

    if (cookieValue) return cookieValue;

    // Fallback: get from meta tag
    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfToken ? csrfToken.value : "";
  }

  addMessage(text, type) {
    const messagesContainer = this.chatMessages.querySelector(".space-y-4");
    const messageWrapper = document.createElement("div");
    let formattedText = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/\n{3,}/g, (match) => "<br>".repeat(match.length))
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br><br>");

    if (type === "user") {
      messageWrapper.className = "flex justify-end";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md user-message-glass text-white p-4 rounded-2xl rounded-br-sm user-message-slide border border-[#4FC1E9] border-opacity-30">
          <div class="flex items-center justify-end space-x-2 mb-2">
            <span class="text-xs text-white font-semibold opacity-80">You</span>
            <div class="w-2 h-2 bg-white rounded-full opacity-80"></div>
          </div>
          ${formattedText}
        </div>
      `;
      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();
    } else if (type === "error") {
      messageWrapper.className = "flex justify-start";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md bg-red-900 bg-opacity-50 border border-red-500 text-red-300 p-4 rounded-2xl rounded-bl-sm message-entrance">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-2 h-2 bg-red-400 rounded-full"></div>
            <span class="text-xs text-red-400 font-semibold">Error</span>
          </div>
          ${text}
        </div>
      `;
      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();
    } else if (type === "bot-typing") {
      // Show a typing bubble for the bot
      messageWrapper.className = "flex justify-start ai-typing-bubble";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md message-glass border border-gray-600 text-gray-200 p-4 rounded-2xl rounded-bl-sm message-entrance flex items-center">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-2 h-2 bg-[#4FC1E9] rounded-full glow-effect"></div>
            <span class="text-xs text-[#4FC1E9] font-semibold">AI Assistant</span>
          </div>
          <span class="typing-dots">
            <span class="inline-block w-2 h-2 bg-gray-400 rounded-full mr-1 animate-bounce"></span>
            <span class="inline-block w-2 h-2 bg-gray-400 rounded-full mr-1 animate-bounce delay-100"></span>
            <span class="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
          </span>
        </div>
      `;
      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();
      return messageWrapper;
    } else {
      // Animate AI reply letter by letter
      messageWrapper.className = "flex justify-start";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md message-glass border border-gray-600 text-gray-200 p-4 rounded-2xl rounded-bl-sm message-entrance">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-2 h-2 bg-[#4FC1E9] rounded-full glow-effect"></div>
            <span class="text-xs text-[#4FC1E9] font-semibold">AI Assistant</span>
          </div>
          <span class="ai-animated-reply"></span>
        </div>
      `;
      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();
      // Animate the reply
      const replySpan = messageWrapper.querySelector('.ai-animated-reply');
      let i = 0;
      function typeLetter() {
        if (i <= formattedText.length) {
          replySpan.innerHTML = formattedText.slice(0, i);
          i++;
          setTimeout(typeLetter, 18); // speed of typing
        }
      }
      typeLetter();
    }
  }

  showTyping() {
    // No-op for now
  }
  hideTyping() {
    // No-op for now
  }
  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 100);
  }
}

// Attach ChatInterface to window as a constructor
window.ChatInterface = ChatInterface;

// Google Drive Picker Integration
function loadGooglePicker(apiKey, accessToken) {
    if (!window.google || !window.google.picker) {
        var script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = function() {
            gapi.load('picker', {'callback': function() {
                openPicker(apiKey, accessToken);
            }});
        };
        document.body.appendChild(script);
    } else {
        openPicker(apiKey, accessToken);
    }
}

function openPicker(apiKey, accessToken) {
    var picker = new google.picker.PickerBuilder()
        .addView(google.picker.ViewId.DOCS)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        var file = data.docs[0];
        alert('You picked: ' + file.name + '\nURL: ' + file.url);
        // You can send file info to your backend here if needed
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var driveBtn = document.getElementById('google-drive-btn');
    if (driveBtn) {
        driveBtn.addEventListener('click', function() {
            fetch('/google-picker-config/')
                .then(response => response.json())
                .then(data => {
                    if (data.apiKey && data.accessToken) {
                        loadGooglePicker(data.apiKey, data.accessToken);
                    } else if (data.error) {
                        alert(data.error);
                    } else {
                        alert('Google Drive integration is not available. Please log in with Google.');
                    }
                });
        });
    }
});

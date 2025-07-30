class ChatInterface {
  constructor() {
    this.messageInput = document.getElementById("messageInput");
    this.chatMessages = document.getElementById("chatMessages");
    this.chatForm = document.getElementById("chatForm");
    this.speechRepliesToggle = document.getElementById("speechRepliesToggle");
    this.chatMeetingSelect = document.getElementById("chatMeetingSelect");
    this.summarizeMeetingBtn = document.getElementById("summarizeMeetingBtn");
    this.selectedMeeting = null;
    this.meetings = [];
    this.isRecording = false;
    this.recognition = null;
    this.speechRepliesEnabled = false;
    this.init();
    // Voice input button
    this.voiceInputBtn = document.getElementById("voiceInputBtn");
    this.micRecording = false;
    if (this.voiceInputBtn) {
      this.voiceInputBtn.addEventListener("click", () => this.toggleVoiceInput());
    }
    // Prepare icons for visual feedback (optional, can be improved)
    if (this.voiceInputBtn) {
      this.voiceInputBtn._defaultBg = this.voiceInputBtn.style.backgroundColor;
    }
    this.initSpeechRecognition && this.initSpeechRecognition();
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
    if (this.speechRepliesToggle) {
      this.speechRepliesToggle.addEventListener("change", (e) => {
        this.speechRepliesEnabled = e.target.checked;
      });
      // Default: speech replies off
      this.speechRepliesToggle.checked = false;
      this.speechRepliesEnabled = false;
    }
    if (this.chatMeetingSelect) {
      this.fetchMeetings();
      this.chatMeetingSelect.addEventListener("change", (e) => {
        const meetingId = e.target.value;
        this.selectedMeeting = this.meetings.find(m => m.id == meetingId) || null;
      });
    }
    if (this.summarizeMeetingBtn) {
      this.summarizeMeetingBtn.addEventListener("click", () => this.summarizeSelectedMeeting());
    }
    this.stopVoiceBtn = document.getElementById("stopVoiceBtn");
    if (this.stopVoiceBtn) {
      this.stopVoiceBtn.addEventListener("click", () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      });
    }
    this.resetChatBtn = document.getElementById("resetChatBtn");
    if (this.resetChatBtn) {
      this.resetChatBtn.addEventListener("click", () => {
        // Clear chat messages and show welcome message
        let messagesContainer = this.chatMessages.querySelector(".space-y-4");
        if (!messagesContainer) messagesContainer = this.chatMessages;
        messagesContainer.innerHTML = '<div class="text-gray-400">Welcome to the AI Chat Assistant!</div>';
      });
    }
  }

  async callAPI(message) {
    const API_URL = "/chat_api/";
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.response || data.message || "No response received";
  }

  getCSRFToken() {
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];

    if (cookieValue) return cookieValue;

    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfToken ? csrfToken.value : "";
  }
}

class RefinedChatInterface extends ChatInterface {
  constructor() {
    super();
    this.voiceButton = document.getElementById("voiceBtn");
    this.voiceStatus = document.getElementById("voiceStatus");
    this.micIcon = document.getElementById("micIcon");
    this.stopIcon = document.getElementById("stopIcon");
    this.waveEffect = document.getElementById("waveEffect");
    this.sendButton = document.getElementById("sendBtn");

    this.isRecording = false;
    this.recognition = null;

    this.initEnhancedFeatures();
    this.initSpeechRecognition();
  }

  initEnhancedFeatures() {
    if (this.voiceButton) {
      this.voiceButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggleVoiceInput();
      });
    }

    if (this.sendButton) {
      this.sendButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.sendMessage();
      });
    }

    const refreshChatBtn = document.getElementById("refreshChatBtn");
    if (refreshChatBtn) {
      refreshChatBtn.addEventListener("click", () => {
        this.clearChat();
      });
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isRecording = true;
<<<<<<< HEAD
        if (this.voiceInputBtn) {
          this.voiceInputBtn.classList.add("bg-red-500");
          this.voiceInputBtn.classList.remove("bg-blue-500", "hover:bg-blue-600");
        }
=======
        this.voiceButton.classList.add("recording");
        this.micIcon.classList.add("hidden");
        this.stopIcon.classList.remove("hidden");
        this.voiceStatus.classList.remove("hidden");
        this.waveEffect.style.display = "block";
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        this.messageInput.value = transcript;
        this.messageInput.focus();
<<<<<<< HEAD
        // Auto-resize textarea after voice input
        this.messageInput.style.height = "auto";
        this.messageInput.style.height =
          Math.min(this.messageInput.scrollHeight, 120) + "px";

        // Meeting voice command logic
        const lower = transcript.toLowerCase();
        if (lower.includes('show meetings') || lower.includes('list meetings')) {
          // Show meetings list in chat
          if (Array.isArray(this.meetings) && this.meetings.length > 0) {
            let msg = 'Here are your meetings:';
            this.meetings.forEach((m, idx) => {
              msg += `\n${idx + 1}. ${m.title} (${m.date} ${m.time})`;
            });
            this.addMessage(msg, 'bot');
          } else {
            this.addMessage('No meetings found.', 'bot');
          }
          return;
        }
        // Try to match a meeting title from voice
        const foundMeeting = (this.meetings || []).find(m => lower.includes(m.title.toLowerCase()));
        if (foundMeeting) {
          let detailsHtml = `<b>Meeting Details:</b><br>`;
          detailsHtml += `<b>Title:</b> ${foundMeeting.title}<br>`;
          detailsHtml += `<b>Date:</b> ${foundMeeting.date}<br>`;
          detailsHtml += `<b>Time:</b> ${foundMeeting.time}<br>`;
          if (foundMeeting.description) detailsHtml += `<b>Description:</b> ${foundMeeting.description}<br>`;
          if (foundMeeting.link) detailsHtml += `<b>Link:</b> <a href="${foundMeeting.link}" target="_blank" style="color:#2563eb;text-decoration:underline;">${foundMeeting.link}</a><br>`;
          if (foundMeeting.folder) {
            let folderUrl = foundMeeting.folder;
            if (!/^https:\/\/drive\.google\.com\/drive\/folders\//.test(folderUrl)) {
              folderUrl = `https://drive.google.com/drive/folders/${folderUrl}`;
            }
            detailsHtml += `<b>Folder:</b> <a href="${folderUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">${folderUrl}</a><br>`;
          }
          this.addMessage(detailsHtml, "bot", true);
          // Optionally, set as selectedMeeting for management
          this.selectedMeeting = foundMeeting;
          // You can add more management actions here (e.g., edit, delete, etc.)
          return;
        }
        // Otherwise, send as normal chat
        this.sendMessage();
=======
        this.autoResizeTextarea();
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
      };



      this.recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        this.stopVoiceRecording();

        if (event.error === "not-allowed") {
          this.showNotification(
            "Microphone access denied. Please allow microphone access and try again.",
            "error"
          );
        } else if (event.error === "no-speech") {
          this.showNotification(
            "No speech detected. Please try again.",
            "warning"
          );
        } else {
          this.showNotification(
            "Speech recognition error. Please try again.",
            "error"
          );
        }
      };

      this.recognition.onend = () => {
        this.stopVoiceRecording();
        if (this.voiceInputBtn) {
          this.voiceInputBtn.classList.remove("bg-red-500");
          this.voiceInputBtn.classList.add("bg-blue-500", "hover:bg-blue-600");
        }
      };
    } else {
      if (this.voiceButton) this.voiceButton.style.display = "none";
      console.warn("Speech recognition not supported in this browser");
    }
  }

  toggleVoiceInput() {
    if (!this.recognition) {
      this.showNotification(
        "Speech recognition is not supported in your browser.",
        "error"
      );
      return;
    }
    if (this.isRecording) {
      this.recognition.stop();
    } else {
      try {
        // Visual feedback: change button color
        if (this.voiceInputBtn) {
          this.voiceInputBtn.classList.add("bg-red-500");
          this.voiceInputBtn.classList.remove("bg-blue-500", "hover:bg-blue-600");
        }
        this.recognition.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
<<<<<<< HEAD
        alert("Could not start speech recognition. Please try again.");
=======
        this.showNotification(
          "Could not start voice recognition. Please try again.",
          "error"
        );
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
      }
    }
  }

  stopVoiceRecording() {
    this.isRecording = false;
<<<<<<< HEAD
    if (this.voiceInputBtn) {
      this.voiceInputBtn.classList.remove("bg-red-500");
      this.voiceInputBtn.classList.add("bg-blue-500", "hover:bg-blue-600");
    }
=======
    this.voiceButton.classList.remove("recording");
    this.micIcon.classList.remove("hidden");
    this.stopIcon.classList.add("hidden");
    this.voiceStatus.classList.add("hidden");
    this.waveEffect.style.display = "none";
  }

  autoResizeTextarea() {
    if (this.messageInput) {
      this.messageInput.style.height = "auto";
      this.messageInput.style.height =
        Math.min(this.messageInput.scrollHeight, 128) + "px";
    }
  }

  addMessage(text, type) {
    let messagesContainer = this.chatMessages.querySelector(".space-y-4");
    if (!messagesContainer) messagesContainer = this.chatMessages;

    const messageWrapper = document.createElement("div");
    let formattedText = this.formatMessage(text);

    if (type === "user") {
      messageWrapper.className = "flex justify-end";
      messageWrapper.innerHTML = `
        <div class="max-w-lg refined-user-message text-white p-4 rounded-2xl rounded-br-sm refined-user-message-enter">
          <div class="flex items-center justify-end space-x-2 mb-2">
            <span class="text-sm font-semibold text-blue-100">You</span>
            <div class="w-6 h-6 bg-gradient-to-br from-blue-300 to-blue-500 rounded-full flex items-center justify-center">
              <i class="fas fa-user text-white text-xs"></i>
            </div>
          </div>
          <div class="text-slate-50">${formattedText}</div>
        </div>
      `;
    } else if (type === "error") {
      messageWrapper.className = "flex justify-start";
      messageWrapper.innerHTML = `
        <div class="max-w-lg bg-red-900 bg-opacity-60 border border-red-500 text-red-300 p-4 rounded-2xl rounded-bl-sm refined-message-enter">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
              <i class="fas fa-exclamation-triangle text-white text-xs"></i>
            </div>
            <span class="text-sm font-semibold text-red-400">Error</span>
          </div>
          <div>${text}</div>
        </div>
      `;
    } else if (type === "bot-typing") {
      messageWrapper.className = "flex justify-start ai-typing-bubble";
      messageWrapper.innerHTML = `
        <div class="max-w-lg refined-bot-message text-white p-4 rounded-2xl rounded-bl-sm opacity-70">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
              <i class="fas fa-robot text-white text-xs"></i>
            </div>
            <span class="text-sm font-semibold text-emerald-400">AI Assistant</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="refined-typing-dots">
              <div class="refined-typing-dot"></div>
              <div class="refined-typing-dot"></div>
              <div class="refined-typing-dot"></div>
            </div>
            <span class="text-slate-400 text-sm">Thinking...</span>
          </div>
        </div>
      `;
    } else if (type === "bot") {
      const existingTyping =
        messagesContainer.querySelectorAll(".ai-typing-bubble");
      existingTyping.forEach((el) => el.remove());

      messageWrapper.className = "flex justify-start";
      messageWrapper.innerHTML = `
        <div class="max-w-lg refined-bot-message text-white p-4 rounded-2xl rounded-bl-sm refined-message-enter">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
              <i class="fas fa-robot text-white text-xs"></i>
            </div>
            <span class="text-sm font-semibold text-emerald-400">AI Assistant</span>
          </div>
          <div class="text-slate-200 ai-animated-reply"></div>
        </div>
      `;

      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();

      const replyDiv = messageWrapper.querySelector(".ai-animated-reply");
      this.typeWriterEffect(replyDiv, formattedText);
      return;
    }

    messagesContainer.appendChild(messageWrapper);
    this.scrollToBottom();

    if (type === "bot-typing") return messageWrapper;
  }

  typeWriterEffect(element, text) {
    let i = 0;
    const speed = 20;

    const typeChar = () => {
      if (i < text.length) {
        element.innerHTML = text.slice(0, i + 1);
        i++;
        setTimeout(typeChar, speed);
        element.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    };

    typeChar();
  }

  formatMessage(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(
        /`(.*?)`/g,
        '<code class="bg-slate-700 px-2 py-1 rounded text-sm">$1</code>'
      )
      .replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" target="_blank" class="text-blue-400 hover:text-blue-300 underline">$1</a>'
      )
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    const bgColor =
      type === "error"
        ? "bg-red-600 border-red-400"
        : type === "warning"
        ? "bg-yellow-600 border-yellow-400"
        : "bg-blue-600 border-blue-400";

    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl max-w-sm refined-notification transform translate-x-full transition-all duration-500 ${bgColor} text-white`;

    const icon =
      type === "error"
        ? "fa-exclamation-circle"
        : type === "warning"
        ? "fa-exclamation-triangle"
        : "fa-info-circle";

    notification.innerHTML = `
      <div class="flex items-center space-x-3">
        <i class="fas ${icon} text-xl"></i>
        <span class="font-medium">${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.remove("translate-x-full");
    }, 100);

    setTimeout(() => {
      notification.classList.add("translate-x-full");
      setTimeout(() => notification.remove(), 500);
    }, 4000);
  }

  clearChat() {
    const messagesContainer =
      this.chatMessages.querySelector(".space-y-4") || this.chatMessages;
    messagesContainer.innerHTML = `
      <div class="flex justify-start">
        <div class="refined-bot-message max-w-lg p-4 rounded-2xl rounded-bl-sm refined-message-enter">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
              <i class="fas fa-robot text-white text-xs"></i>
            </div>
            <span class="text-sm font-semibold text-emerald-400">AI Assistant</span>
          </div>
          <p class="text-slate-200">
            👋 Chat refreshed! I'm here to help. Type your message or use voice input.
          </p>
        </div>
      </div>
    `;
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

<<<<<<< HEAD
    // If message matches a meeting title (partial, case-insensitive)
    if (this.meetings && this.meetings.length > 0) {
      const lowerMsg = message.toLowerCase();
      const foundMeeting = this.meetings.find(m => lowerMsg.includes(m.title.toLowerCase()));
      if (foundMeeting) {
        let detailsHtml = `<b>Meeting Details:</b><br>`;
        detailsHtml += `<b>Title:</b> ${foundMeeting.title}<br>`;
        detailsHtml += `<b>Date:</b> ${foundMeeting.date}<br>`;
        detailsHtml += `<b>Time:</b> ${foundMeeting.time}<br>`;
        if (foundMeeting.description) detailsHtml += `<b>Description:</b> ${foundMeeting.description}<br>`;
        if (foundMeeting.link) detailsHtml += `<b>Link:</b> <a href="${foundMeeting.link}" target="_blank" style="color:#2563eb;text-decoration:underline;">${foundMeeting.link}</a><br>`;
        if (foundMeeting.folder) {
          let folderUrl = foundMeeting.folder;
          if (!/^https:\/\/drive\.google\.com\/drive\/folders\//.test(folderUrl)) {
            folderUrl = `https://drive.google.com/drive/folders/${folderUrl}`;
          }
          detailsHtml += `<b>Folder:</b> <a href="${folderUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">${folderUrl}</a><br>`;
        }
        this.addMessage(message, "user");
        this.addMessage(detailsHtml, "bot", true);
        this.selectedMeeting = foundMeeting;
        this.messageInput.value = "";
        this.messageInput.style.height = "auto";
        return;
      }
    }

=======
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
    this.addMessage(message, "user");
    this.messageInput.value = "";
    this.messageInput.style.height = "auto";

    this.sendButton.disabled = true;
    this.sendButton.innerHTML =
      '<i class="fas fa-spinner fa-spin text-lg"></i>';

    const typingMessage = this.addMessage("", "bot-typing");

    try {
      const response = await this.callAPI(message);
      console.log("AI API response:", response);

      if (typingMessage) typingMessage.remove();
      this.addMessage(response, "bot");
    } catch (error) {
      console.error("Error:", error);
      if (typingMessage) typingMessage.remove();
      this.addMessage(
        "Sorry, I encountered an error. Please try again.",
        "error"
      );
    } finally {
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<i class="fas fa-paper-plane text-lg"></i>';
      this.messageInput.focus();
    }
  }

<<<<<<< HEAD
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
    // Robust: use .space-y-4 if present, else fallback to #chatMessages
    let messagesContainer = this.chatMessages.querySelector(".space-y-4");
    if (!messagesContainer) messagesContainer = this.chatMessages;
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
      // Add a visible typing bubble for AI
      messageWrapper.className = "flex justify-start ai-typing-bubble";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md ai-message-glass text-white p-4 rounded-2xl rounded-bl-sm border border-[#4FC1E9] border-opacity-30 opacity-60 italic">
          <span>AI is typing...</span>
        </div>
      `;
      messagesContainer.appendChild(messageWrapper);
      this.scrollToBottom();
      return messageWrapper;
    } else if (type === "bot") {
      // Only remove typing bubbles, not all AI messages
      const existingTyping = messagesContainer.querySelectorAll('.ai-typing-bubble');
      existingTyping.forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      messageWrapper.className = "flex justify-start";
      messageWrapper.innerHTML = `
        <div class="max-w-xs lg:max-w-md ai-message-glass text-white p-4 rounded-2xl rounded-bl-sm ai-message-slide border border-[#4FC1E9] border-opacity-30">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-2 h-2 bg-[#4FC1E9] rounded-full"></div>
            <span class="text-xs text-[#4FC1E9] font-semibold">AI</span>
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
          messageWrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
          setTimeout(typeLetter, 18); // speed of typing
        }
      }
      typeLetter();
      // Text-to-Speech if enabled
      if (this.speechRepliesEnabled && 'speechSynthesis' in window) {
        const utter = new window.SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
        utter.lang = 'en-US';
        window.speechSynthesis.speak(utter);
      }
    }
  }

  showTyping() {
    // No-op for now
  }
  hideTyping() {
    // No-op for now
  }
=======
>>>>>>> b16fb3438c1951f77da07364414d01450b4256c8
  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 100);
  }

  async fetchMeetings() {
    try {
      const response = await fetch("/showmeeting/");
      const data = await response.json();
      this.meetings = data.events || [];
      this.populateMeetingDropdown();
    } catch (e) {
      if (this.chatMeetingSelect) {
        this.chatMeetingSelect.innerHTML = '<option value="">Failed to load meetings</option>';
      }
    }
  }

  populateMeetingDropdown() {
    if (!this.chatMeetingSelect) return;
    this.chatMeetingSelect.innerHTML = '<option value="">Select a meeting...</option>';
    this.meetings.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = `${m.title} (${m.date} ${m.time})`;
      this.chatMeetingSelect.appendChild(option);
    });
  }

  async summarizeSelectedMeeting() {
    if (!this.selectedMeeting) {
      this.addMessage("Please select a meeting to summarize.", "error");
      return;
    }
    const meeting = this.selectedMeeting;
    const summaryPrompt = `Summarize the following meeting in a professional, point-by-point format.\n\nMeeting Details:\nTitle: ${meeting.title}\nDate: ${meeting.date}\nTime: ${meeting.time}\nDescription: ${meeting.description || ''}\nLink: ${meeting.link || ''}\nFolder: ${meeting.folder || ''}\n\nPlease provide the summary as a numbered or bulleted list of key points.`;
    this.addMessage("Summarize the selected meeting.", "user");
    // Show typing bubble for AI
    const typingBubble = this.addMessage('', 'bot-typing');
    try {
      const response = await this.callAPI(summaryPrompt);
      if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
      this.addMessage(response, "bot");
    } catch (error) {
      if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
      this.addMessage("Sorry, I couldn't summarize the meeting. Please try again.", "error");
    }
  }
}

// Initialize chat interface
let chatInitialized = false;
document.getElementById("aiChatBtn").addEventListener("click", function () {
  const chatSection = document.getElementById("chatSection");
  chatSection.classList.toggle("hidden");

  if (!chatInitialized && !chatSection.classList.contains("hidden")) {
    new RefinedChatInterface();
    chatInitialized = true;
  }
});

window.ChatInterface = ChatInterface;
window.GOOGLE_ACCESS_TOKEN = "{{ google_access_token|default:'' }}";

// Google Drive Picker Integration
function loadGooglePicker(apiKey, accessToken) {
  if (!window.google?.picker) {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = function () {
      gapi.load("picker", () => openPicker(apiKey, accessToken));
    };
    document.body.appendChild(script);
  } else {
    openPicker(apiKey, accessToken);
  }
}

function openPicker(apiKey, accessToken) {
  const picker = new google.picker.PickerBuilder()
    .addView(google.picker.ViewId.DOCS)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback(pickerCallback)
    .build();

  picker.setVisible(true);
}

function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const file = data.docs[0];
    alert(`You picked: ${file.name}\nURL: ${file.url}`);
  }
}

// Google Drive Upload Functions
async function uploadFileToDrive(file, parentId = null) {
  const accessToken = window.GOOGLE_ACCESS_TOKEN;
  const metadata = {
    name: file.webkitRelativePath
      ? file.webkitRelativePath.split("/").pop()
      : file.name,
    mimeType: file.type || "application/octet-stream",
    ...(parentId ? { parents: [parentId] } : {}),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", file);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: new Headers({ Authorization: "Bearer " + accessToken }),
      body: form,
    }
  );

  if (!response.ok) throw new Error("Upload failed: " + response.statusText);
  return await response.json();
}

async function createDriveFolder(name, parentId = null) {
  const accessToken = window.GOOGLE_ACCESS_TOKEN;
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok)
    throw new Error("Folder creation failed: " + response.statusText);
  return await response.json();
}

// DOM Content Loaded Handler
document.addEventListener("DOMContentLoaded", function () {
  // Google Drive Button
  const driveBtn = document.getElementById("google-drive-btn");
  if (driveBtn) {
    driveBtn.addEventListener("click", function () {
      fetch("/google-picker-config/")
        .then((response) => response.json())
        .then((data) => {
          if (data.apiKey && data.accessToken) {
            loadGooglePicker(data.apiKey, data.accessToken);
          } else if (data.error) {
            alert(data.error);
          } else {
            alert(
              "Google Drive integration is not available. Please log in with Google."
            );
          }
        });
    });
  }

  // File Upload Form
  const fileUploadForm = document.getElementById("fileUploadForm");
  if (fileUploadForm) {
    fileUploadForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const input = document.getElementById("fileInput");
      const files = Array.from(input.files);
      const uploadStatus = document.getElementById("uploadStatus");
      const uploadBtn = this.querySelector('button[type="submit"]');

      if (!files.length) {
        uploadStatus.textContent = "Please select files or a folder.";
        uploadStatus.classList.remove("hidden", "text-green-400");
        uploadStatus.classList.add("text-red-400");
        return;
      }

      uploadBtn.disabled = true;
      uploadStatus.textContent = "Uploading...";
      uploadStatus.classList.remove("hidden", "text-red-400", "text-green-400");
      uploadStatus.classList.add("text-yellow-300");

      const folderMap = {};
      let uploaded = 0;

      try {
        for (const file of files) {
          let parentId = null;

          if (file.webkitRelativePath) {
            const pathParts = file.webkitRelativePath.split("/");
            if (pathParts.length > 1) {
              let currentPath = "";
              for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath += pathParts[i] + "/";
                if (!folderMap[currentPath]) {
                  const parentPath =
                    currentPath.split("/").slice(0, -2).join("/") + "/";
                  const parentFolderId = folderMap[parentPath] || null;
                  const folder = await createDriveFolder(
                    pathParts[i],
                    parentFolderId
                  );
                  folderMap[currentPath] = folder.id;
                }
              }
              parentId = folderMap[currentPath];
            }
          }

          await uploadFileToDrive(file, parentId);
          uploaded++;
          uploadStatus.textContent = `Uploading... (${uploaded}/${files.length})`;
        }

        uploadStatus.textContent =
          "Upload complete! Files and folders have been uploaded to your Google Drive.";
        uploadStatus.classList.remove("text-yellow-300", "text-red-400");
        uploadStatus.classList.add("text-green-400");
      } catch (err) {
        uploadStatus.textContent = "Upload failed: " + err.message;
        uploadStatus.classList.remove("text-yellow-300", "text-green-400");
        uploadStatus.classList.add("text-red-400");
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  // Load Today's Meetings
  fetch("/showmeeting/", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
    .then((response) => response.json())
    .then((data) => {
      const meetings = data.events || [];
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const todaysMeetings = meetings.filter(
        (m) => m.date?.slice(0, 10) === todayStr
      );

      // Populate drive links
      const driveLinksDiv = document.getElementById("todaysDriveLinks");
      if (driveLinksDiv) {
        driveLinksDiv.innerHTML =
          todaysMeetings.length === 0
            ? '<div class="text-gray-400">No drive links for today.</div>'
            : todaysMeetings
                .map((m) =>
                  m.folder
                    ? `<div><span class="mr-2">📁</span><a href="${
                        m.folder
                      }" target="_blank" class="underline hover:text-blue-400">${
                        m.title
                      } (${formatTime(m.time)})</a></div>`
                    : ""
                )
                .join("") ||
              '<div class="text-gray-400">No drive links for today.</div>';
      }

      // Populate meeting dropdown
      const meetingSelect = document.getElementById("meetingSelect");
      if (meetingSelect) {
        meetingSelect.innerHTML =
          todaysMeetings.length === 0
            ? '<option value="">No meetings today</option>'
            : todaysMeetings
                .map(
                  (m) =>
                    `<option value="${m.id}">${m.title} (${formatTime(
                      m.time
                    )})</option>`
                )
                .join("");
      }

      // Populate sidebar meetings
      const sidebarMeetingsDiv = document.getElementById(
        "sidebarTodaysMeetings"
      );
      if (sidebarMeetingsDiv) {
        sidebarMeetingsDiv.innerHTML =
          todaysMeetings.length === 0
            ? '<div class="text-gray-400">No meetings scheduled for today.</div>'
            : todaysMeetings
                .map((m) => {
                  const isValidDriveLink = m.folder?.startsWith(
                    "https://drive.google.com/drive/folders/"
                  );
                  return `
              <div class="flex flex-col bg-gray-900 bg-opacity-60 rounded-lg p-2 mb-2">
                <div class="font-semibold text-white flex items-center">
                  <span class="mr-2">📝</span>${m.title}
                </div>
                <div class="text-xs text-gray-300 flex items-center">
                  <span class="mr-1">⏰</span>${formatTime(m.time)}
                </div>
                ${
                  isValidDriveLink
                    ? `<div class="text-xs mt-1">
                      <span class="mr-1">📁</span>
                      <a href="${m.folder}" target="_blank" class="underline hover:text-blue-400">Drive Link</a>
                    </div>`
                    : `<div class="text-xs mt-1">
                      <span class="mr-1">📁</span>
                      <button onclick="alert('You must submit a Drive link first.')" class="underline text-yellow-400 hover:text-yellow-500 focus:outline-none">Drive Link</button>
                    </div>`
                }
              </div>
            `;
                })
                .join("");
      }
    });

  // Save Folder Link
  const saveFolderLinkBtn = document.getElementById("saveFolderLinkBtn");
  if (saveFolderLinkBtn) {
    saveFolderLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const folderLinkInput = document.getElementById("meetingFolderLink");
      const folderLink = folderLinkInput.value.trim();
      const meetingSelect = document.getElementById("meetingSelect");
      const meetingId = meetingSelect?.value || "";
      const statusDiv = document.getElementById("folderLinkStatus");

      if (!folderLink || !meetingId) {
        statusDiv.textContent =
          "Please select a meeting and enter a folder link.";
        statusDiv.classList.remove("hidden", "text-green-400");
        statusDiv.classList.add("text-red-400");
        return;
      }

      fetch("/update_meeting_folder/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken":
            (
              document.cookie
                .split("; ")
                .find((row) => row.startsWith("csrftoken=")) || ""
            ).split("=")[1] || "",
        },
        body: JSON.stringify({
          meeting_id: meetingId,
          folder_link: folderLink,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            statusDiv.textContent = "Folder link saved to meeting!";
            statusDiv.classList.remove("hidden", "text-red-400");
            statusDiv.classList.add("text-green-400");
          } else {
            statusDiv.textContent = data.error || "Failed to save folder link.";
            statusDiv.classList.remove("hidden", "text-green-400");
            statusDiv.classList.add("text-red-400");
          }
        })
        .catch(() => {
          statusDiv.textContent = "Failed to save folder link.";
          statusDiv.classList.remove("hidden", "text-green-400");
          statusDiv.classList.add("text-red-400");
        });
    });
  }

  // Logout Button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/signout/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": new ChatInterface().getCSRFToken(),
          },
        });
      } catch (e) {
        // Ignore errors
      }
      window.location.href = "/login/";
    });
  }

  // Helper Functions
  function formatTime(timeStr) {
    if (!timeStr) return "";
    if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;

    const dateObj = new Date(timeStr);
    if (isNaN(dateObj)) return "Invalid Time";

    return dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
});

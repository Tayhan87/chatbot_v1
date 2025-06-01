class ChatInterface {
  constructor() {
    this.messageInput = document.getElementById("messageInput");
    this.sendButton = document.getElementById("sendButton");
    this.chatMessages = document.getElementById("chatMessages");
    this.typingIndicator = document.getElementById("typingIndicator");

    this.init();
  }

  init() {
    // Send message on button click
    this.sendButton.addEventListener("click", () => this.sendMessage());

    // Send message on Enter (but not Shift+Enter)
    this.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.messageInput.addEventListener("input", () => {
      this.messageInput.style.height = "auto";
      this.messageInput.style.height =
        Math.min(this.messageInput.scrollHeight, 120) + "px";
    });
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    // Add user message to chat
    this.addMessage(message, "user");
    this.messageInput.value = "";
    this.messageInput.style.height = "auto";

    // Disable send button
    this.sendButton.disabled = true;

    // Show typing indicator
    this.showTyping();

    try {
      // Send message to Django backend
      const response = await this.callAPI(message);

      // Hide typing indicator
      this.hideTyping();

      // Add bot response
      this.addMessage(response, "bot");
    } catch (error) {
      console.error("Error:", error);
      this.hideTyping();
      this.addMessage(
        "Sorry, I encountered an error. Please try again.",
        "error"
      );
    } finally {
      // Re-enable send button
      this.sendButton.disabled = false;
      this.messageInput.focus();
    }
  }

  async callAPI(message) {
    // Replace with your Django backend URL
    const API_URL = "/chat_api/"; // Adjust this to match your Django endpoint

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": this.getCSRFToken(), // For Django CSRF protection
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
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${
      type === "user"
        ? "user-message"
        : type === "error"
        ? "error-message"
        : "bot-message"
    }`;

    // Convert newlines to <br> for HTML rendering
    const formattedText = text.replace(/\n/g, "<br>");
    messageDiv.innerHTML = formattedText;

    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showTyping() {
    this.typingIndicator.style.display = "block";
    this.scrollToBottom();
  }

  hideTyping() {
    this.typingIndicator.style.display = "none";
  }

  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 100);
  }
}

// Initialize chat interface when page loads
document.addEventListener("DOMContentLoaded", () => {
  new ChatInterface();
});

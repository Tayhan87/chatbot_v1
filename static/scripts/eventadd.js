class MeetingManager {
  constructor() {
    this.meetings = [];
    this.folders = [];
    this.currentEditingId = null;
    this.init();
    // this.loadMeetings();
    this.folderList().then(() => this.loadMeetings());
  }

  init() {
    document
      .getElementById("addMeetingBtn")
      .addEventListener("click", () => this.openAddModal());
    document
      .getElementById("closeModal")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("cancelBtn")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("meetingForm")
      .addEventListener("submit", (e) => this.handleSubmit(e));
  }

  // Load meetings from Django backend
  async loadMeetings() {
    try {
      const response = await fetch("/showmeeting/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCSRFToken(),
        },
      });
      // console.log("Response from backend:", response);

      if (response.ok) {
        const data = await response.json();
        this.meetings = data.events;
        console.log(this.meetings);
        console.log("Hello World");
        // await this.folderList();
        this.renderMeetings();
      } else {
        // Fallback to sample data for demo
        this.loadSampleData();
      }
    } catch (error) {
      console.log("Backend not available, using sample data");
      this.loadSampleData();
    }
  }

  // Save meeting to Django backend
  async saveMeeting(meetingData) {
    try {
      const url = this.currentEditingId
        ? `/editevent/${this.currentEditingId}/`
        : "/setmeeting/";

      const method = this.currentEditingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCSRFToken(),
        },
        body: JSON.stringify(meetingData),
      });

      if (response.ok) {
        await this.folderList();
        await this.loadMeetings();
        this.currentEditingId = null;
        return true;
      } else {
        alert("Failed to save meeting. Please try again.");
        return false;
      }
    } catch (error) {
      console.error("Error saving meeting:", error);
      alert("Error saving meeting. Please check your connection.");
      return false;
    }
  }

  // Delete meeting from Django backend
  async deleteMeeting(id) {
    if (!confirm("Delete this meeting?")) return;

    try {
      const response = await fetch(`/deleteevent/${id}/`, {
        method: "DELETE",
        headers: {
          "X-CSRFToken": this.getCSRFToken(),
        },
      });

      if (response.ok) {
        await this.loadMeetings();
      } else {
        alert("Failed to delete meeting. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting meeting:", error);
      alert("Error deleting meeting. Please check your connection.");
    }
  }

  getCSRFToken() {
    const name = "csrftoken";
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + "=") {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  loadSampleData() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    this.meetings = [
      {
        id: 1,
        title: "Team Standup",
        date: tomorrow.toISOString().split("T")[0],
        time: "09:00",
        link: "https://meet.google.com/abc-defg-hij",
        folder: "team-updates",
        description: "Weekly team sync and progress updates",
      },
      {
        id: 2,
        title: "Client Review",
        date: nextWeek.toISOString().split("T")[0],
        time: "14:00",
        link: "https://zoom.us/j/1234567890",
        folder: "client-meetings",
        description: "Quarterly business review with client",
      },
      {
        id: 3,
        title: "Project Planning",
        date: lastWeek.toISOString().split("T")[0],
        time: "10:30",
        link: "https://meet.google.com/xyz-uvwx-rst",
        folder: "project-alpha",
        description: "Sprint planning and resource allocation",
      },
    ];
    this.renderMeetings();
  }

  openAddModal() {
    document.getElementById("modalTitle").textContent = "Add Meeting";
    document.getElementById("submitBtn").textContent = "Save Meeting";
    document.getElementById("meetingForm").reset();
    this.currentEditingId = null;
    document.getElementById("meetingModal").classList.remove("hidden");
    // Clear any previous error messages
    this.clearFormErrors();
  }

  openEditModal(id) {
    const meeting = this.meetings.find((m) => m.id == id);
    if (!meeting) {
      console.error("Meeting not found for ID:", id);
      return;
    }
    document.getElementById("modalTitle").textContent = "Edit Meeting";
    document.getElementById("submitBtn").textContent = "Update Meeting";
    document.getElementById("meetingTitle").value = meeting.title;
    document.getElementById("meetingDate").value = meeting.date && meeting.date.length > 10 ? meeting.date.slice(0,10) : meeting.date;
    document.getElementById("meetingTime").value = meeting.time && meeting.time.length > 5 ? meeting.time.slice(0,5) : meeting.time;
    document.getElementById("meetingLink").value = meeting.link || "";
    document.getElementById("meetingFolder").value = meeting.folder || "";
    document.getElementById("meetingDescription").value = meeting.description || "";
    document.getElementById("meetingDuration").value = meeting.duration || "";
    document.getElementById("meetingPlatform").value = meeting.platform || "";
    document.getElementById("meetingReminder").value = meeting.reminder || "";
    this.currentEditingId = id;
    document.getElementById("meetingModal").classList.remove("hidden");
    this.clearFormErrors();
  }

  closeModal() {
    document.getElementById("meetingModal").classList.add("hidden");
    this.currentEditingId = null;
  }

  clearFormErrors() {
    const errorDiv = document.getElementById("formErrors");
    if (errorDiv) errorDiv.remove();
    const fields = [
      "meetingTitle",
      "meetingDate",
      "meetingTime",
      "meetingLink",
      "meetingFolder",
      "meetingDuration",
      "meetingPlatform",
      "meetingReminder"
    ];
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.removeAttribute("aria-invalid");
    });
  }

  showFormErrors(errors) {
    this.clearFormErrors();
    const form = document.getElementById("meetingForm");
    const errorDiv = document.createElement("div");
    errorDiv.id = "formErrors";
    errorDiv.className = "text-red-500 mb-2";
    errorDiv.setAttribute("role", "alert");
    errorDiv.setAttribute("aria-live", "assertive");
    errorDiv.innerHTML = errors.map(e => `<div>${e}</div>`).join("");
    form.prepend(errorDiv);
    errors.forEach(err => {
      const match = err.match(/'(.*?)'/);
      if (match) {
        const el = document.getElementById(match[1]);
        if (el) el.setAttribute("aria-invalid", "true");
      }
    });
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.clearFormErrors();
    const errors = [];
    const title = document.getElementById("meetingTitle").value.trim();
    const date = document.getElementById("meetingDate").value;
    const time = document.getElementById("meetingTime").value;
    const link = document.getElementById("meetingLink").value.trim();
    const folder = document.getElementById("meetingFolder").value.trim();
    const description = document.getElementById("meetingDescription").value.trim();
    const duration = document.getElementById("meetingDuration").value;
    const platform = document.getElementById("meetingPlatform").value;
    const reminder = document.getElementById("meetingReminder").value;

    // Required fields
    if (!title) errors.push("'meetingTitle' is required.");
    if (!date) errors.push("'meetingDate' is required.");
    if (!time) errors.push("'meetingTime' is required.");
    if (!duration) errors.push("'meetingDuration' is required.");
    if (!platform) errors.push("'meetingPlatform' is required.");
    if (!link) errors.push("'meetingLink' is required.");
    if (!reminder) errors.push("'meetingReminder' is required.");
    if (!folder) errors.push("'meetingFolder' is required.");

    // End time must be after start time
    if (time && duration) {
      const [h, m] = time.split(":").map(Number);
      const start = new Date(date + 'T' + time);
      const end = new Date(start.getTime() + parseInt(duration) * 60000);
      if (end <= start) {
        errors.push("End time must be after start time.");
      }
    }

    // Meeting link must be a valid URL
    if (link && !/^https?:\/\/.+\..+/.test(link)) {
      errors.push("Meeting link must be a valid URL.");
    }

    // Date can't be in the past
    const today = new Date();
    const selectedDate = new Date(date + 'T' + (time || '00:00'));
    if (date && selectedDate < today.setHours(0,0,0,0)) {
      errors.push("You cannot schedule a meeting in the past. Please select today or a future date.");
    }

    if (errors.length > 0) {
      this.showFormErrors(errors);
      return;
    }

    const meetingData = {
      title,
      date,
      time,
      link,
      folder,
      description,
      duration,
      platform,
      reminder
    };

    const success = await this.saveMeeting(meetingData);
    if (success) {
      await this.folderList();
      this.closeModal();
      // Optionally show a success message
      // alert('Meeting saved successfully!');
    }
  }

  formatDate(dateStr) {
    // Accepts 'YYYY-MM-DD' or ISO string
    if (!dateStr) return '';
    let dateObj;
    if (dateStr.length === 10) {
      // 'YYYY-MM-DD'
      dateObj = new Date(dateStr + 'T00:00:00');
    } else {
      dateObj = new Date(dateStr);
    }
    if (isNaN(dateObj)) return 'Invalid Date';
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  formatTime(timeStr) {
    // Accepts 'HH:MM' or ISO string
    if (!timeStr) return '';
    if (/^\d{2}:\d{2}$/.test(timeStr)) {
      // 'HH:MM' format
      return timeStr;
    }
    // Try to parse as ISO string
    const dateObj = new Date(timeStr);
    if (isNaN(dateObj)) return 'Invalid Time';
    return dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  async folderList() {
    try {
      const response = await fetch("/folderList/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCSRFToken(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(data);
        this.folders = data.folders;
        console.log(this.folders);

        const folder = this.folders.find((info) => info.id == folderValue);
        return folder ? folder.name : "No Folder";
      } else {
        console.log("Failed to fetch folder information.");
      }
    } catch (error) {
      console.log("Didn't get any folder information", error);
    }
  }

  getFolderDisplayName(folderValue) {
    // Use `find` instead of `forEach` for searching the folder
    const folder = this.folders.find((info) => info.id == folderValue);
    return folder ? folder.name : "No Folder";
  }

  renderMeetings() {
    const container = document.getElementById("meetingsList");
    if (!container) return;
    if (this.meetings.length === 0) {
      container.innerHTML = '<div class="text-gray-300 text-center py-4">No meetings yet.</div>';
      return;
    }
    container.innerHTML = this.meetings.map(meeting => `
      <div class="meeting-card rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between">
        <div class="flex-1">
          <h4 class="text-white font-medium text-lg mb-1">${meeting.title}</h4>
          <div class="text-gray-300 text-sm mb-1">
            ${this.formatDate(meeting.date)} at ${this.formatTime(meeting.time)}
            ${meeting.duration ? `&bull; ${meeting.duration} min` : ''}
            ${meeting.platform ? `&bull; ${meeting.platform}` : ''}
          </div>
          ${meeting.description ? `<div class="text-gray-400 text-sm mb-1">${meeting.description}</div>` : ''}
          ${meeting.link ? `<a href="${meeting.link}" target="_blank" class="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm mt-1 transition-colors"><svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/></svg>Join Meeting</a>` : ''}
          ${meeting.folder ? (() => {
            const folderObj = this.folders.find(f => f.id == meeting.folder);
            const folderName = folderObj ? folderObj.name : 'Open Drive Folder';
            return `<a href="https://drive.google.com/drive/folders/${meeting.folder}" target="_blank" style="position:relative;z-index:10;pointer-events:auto;" class="inline-flex items-center text-green-400 hover:text-green-300 text-sm mt-1 transition-colors" title="Open Drive Folder"><svg class="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H14V6H19C20.1 6 21 6.9 21 8V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V8C3 6.9 3.9 6 5 6H10V4M5 8V19H19V8H5M12 10C13.1 10 14 10.9 14 12C14 13.1 13.1 14 12 14C10.9 14 10 13.1 10 12C10 10.9 10.9 10 12 10Z"/></svg>${folderName}</a>`;
          })() : ''}
          ${meeting.reminder && meeting.reminder !== 'none' ? `<div class="text-xs text-gray-400 mt-1">Reminder: ${this.getReminderText(meeting.reminder)}</div>` : ''}
        </div>
        <div class="flex space-x-2 mt-4 md:mt-0 md:ml-4">
          <button onclick="meetingManager.openEditModal('${meeting.id}')"
            class="action-btn bg-yellow-400 text-black rounded-full p-2 hover:bg-yellow-500 shadow"
            aria-label="Edit meeting">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6-6m2 2l-6 6m-2 2h6" />
            </svg>
          </button>
          <button onclick="meetingManager.deleteMeeting('${meeting.id}')"
            class="action-btn bg-red-500 text-white rounded-full p-2 hover:bg-red-600 shadow"
            aria-label="Delete meeting">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  getReminderText(reminder) {
    switch(reminder) {
      case '5': return '5 minutes before';
      case '10': return '10 minutes before';
      case '30': return '30 minutes before';
      case '60': return '1 hour before';
      default: return 'No reminder';
    }
  }
}

const meetingManager = new MeetingManager();

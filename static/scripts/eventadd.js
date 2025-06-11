class MeetingManager {
  constructor() {
    this.meetings = [];
    this.currentEditingId = null;
    this.init();
    this.loadMeetings();
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
      const response = await fetch("/api/meetings/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCSRFToken(),
        },
      });

      if (response.ok) {
        this.meetings = await response.json();
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
        ? `/api/meetings/${this.currentEditingId}/`
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
        const savedMeeting = await response.json();

        if (this.currentEditingId) {
          // Update existing meeting
          const index = this.meetings.findIndex(
            (m) => m.id === this.currentEditingId
          );
          if (index !== -1) {
            this.meetings[index] = savedMeeting;
          }
        } else {
          // Add new meeting
          this.meetings.push(savedMeeting);
        }

        this.renderMeetings();
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
      const response = await fetch(`/api/meetings/${id}/`, {
        method: "DELETE",
        headers: {
          "X-CSRFToken": this.getCSRFToken(),
        },
      });

      if (response.ok) {
        this.meetings = this.meetings.filter((m) => m.id !== id);
        this.renderMeetings();
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
  }

  openEditModal(id) {
    const meeting = this.meetings.find((m) => m.id === id);
    if (!meeting) return;

    document.getElementById("modalTitle").textContent = "Edit Meeting";
    document.getElementById("submitBtn").textContent = "Update Meeting";
    document.getElementById("meetingTitle").value = meeting.title;
    document.getElementById("meetingDate").value = meeting.date;
    document.getElementById("meetingTime").value = meeting.time;
    document.getElementById("meetingLink").value = meeting.link || "";
    document.getElementById("meetingFolder").value = meeting.folder || "";
    document.getElementById("meetingDescription").value =
      meeting.description || "";

    this.currentEditingId = id;
    document.getElementById("meetingModal").classList.remove("hidden");
  }

  closeModal() {
    document.getElementById("meetingModal").classList.add("hidden");
    this.currentEditingId = null;
  }

  async handleSubmit(e) {
    e.preventDefault();

    const meetingData = {
      title: document.getElementById("meetingTitle").value,
      date: document.getElementById("meetingDate").value,
      time: document.getElementById("meetingTime").value,
      link: document.getElementById("meetingLink").value,
      folder: document.getElementById("meetingFolder").value,
      description: document.getElementById("meetingDescription").value,
    };

    const success = await this.saveMeeting(meetingData);
    if (success) {
      this.closeModal();
    }
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(":");
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  getFolderDisplayName(folderValue) {
    const folderMap = {
      "project-alpha": "Project Alpha",
      "client-meetings": "Client Meetings",
      "team-updates": "Team Updates",
      "quarterly-reviews": "Quarterly Reviews",
      general: "General",
    };
    return folderMap[folderValue] || "No Folder";
  }

  renderMeetings() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().split(" ")[0].substring(0, 5);

    const upcoming = this.meetings
      .filter((meeting) => {
        if (meeting.date > today) return true;
        if (meeting.date === today && meeting.time > currentTime) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });

    const past = this.meetings
      .filter((meeting) => {
        if (meeting.date < today) return true;
        if (meeting.date === today && meeting.time <= currentTime) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.time.localeCompare(a.time);
      });

    document.getElementById("upcomingCount").textContent = upcoming.length;
    document.getElementById("pastCount").textContent = past.length;

    this.renderMeetingList("upcomingMeetings", upcoming, true);
    this.renderMeetingList("pastMeetings", past, false);
  }

  renderMeetingList(containerId, meetings, isUpcoming) {
    const container = document.getElementById(containerId);

    if (meetings.length === 0) {
      container.innerHTML =
        '<div class="text-gray-300 text-center py-4">No meetings</div>';
      return;
    }

    container.innerHTML = meetings
      .map(
        (meeting) => `
                    <div class="meeting-card rounded-lg p-4">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <h4 class="text-white font-medium text-lg">${
                                  meeting.title
                                }</h4>
                                <div class="text-gray-300 text-sm mt-1">
                                    ${this.formatDate(
                                      meeting.date
                                    )} at ${this.formatTime(meeting.time)}
                                </div>
                                ${
                                  meeting.folder
                                    ? `
                                    <div class="text-blue-300 text-xs mt-1">
                                        📁 ${this.getFolderDisplayName(
                                          meeting.folder
                                        )}
                                    </div>
                                `
                                    : ""
                                }
                                ${
                                  meeting.description
                                    ? `
                                    <div class="text-gray-400 text-sm mt-2">${meeting.description}</div>
                                `
                                    : ""
                                }
                                ${
                                  meeting.link
                                    ? `
                                    <a href="${meeting.link}" target="_blank" class="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm mt-2 transition-colors">
                                        <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/>
                                        </svg>
                                        Join Meeting
                                    </a>
                                `
                                    : ""
                                }
                            </div>
                            <div class="flex space-x-2 ml-4">
                                ${
                                  isUpcoming
                                    ? `
                                    <button 
                                        onclick="meetingManager.openEditModal(${meeting.id})"
                                        class="text-blue-400 hover:text-blue-300 transition-colors"
                                        title="Edit Meeting"
                                    >
                                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                        </svg>
                                    </button>
                                `
                                    : ""
                                }
                                <button 
                                    onclick="meetingManager.deleteMeeting(${
                                      meeting.id
                                    })"
                                    class="text-gray-400 hover:text-red-400 transition-colors"
                                    title="Delete Meeting"
                                >
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `
      )
      .join("");
  }
}

const meetingManager = new MeetingManager();

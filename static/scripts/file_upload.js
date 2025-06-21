class FileUploadManager {
    constructor() {
        this.files = [];
        this.currentFilter = '';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadFiles();
    }

    setupEventListeners() {
        // File input and drag & drop
        const fileInput = document.getElementById('fileInput');
        const fileDropZone = document.getElementById('fileDropZone');
        const uploadForm = document.getElementById('uploadForm');

        // File selection
        fileDropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop
        fileDropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        fileDropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        fileDropZone.addEventListener('drop', (e) => this.handleDrop(e));

        // Form submission
        uploadForm.addEventListener('submit', (e) => this.handleUpload(e));

        // Create folder button
        document.getElementById('createFolderBtn').addEventListener('click', () => this.createNewFolder());

        // Filter and refresh
        document.getElementById('filterType').addEventListener('change', (e) => this.filterFiles(e.target.value));
        document.getElementById('refreshFiles').addEventListener('click', () => this.loadFiles());

        // Upload button
        document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.displayFileInfo(file);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            document.getElementById('fileInput').files = files;
            this.displayFileInfo(file);
        }
    }

    displayFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        fileInfo.classList.remove('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async createNewFolder() {
        const folderNameInput = document.getElementById('newFolderName');
        const folderName = folderNameInput.value.trim();

        if (!folderName) {
            this.showNotification('Please enter a folder name', 'error');
            return;
        }

        try {
            const response = await fetch('/folderList/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken(),
                },
                body: JSON.stringify({ folder_name: folderName })
            });

            if (response.ok) {
                // Add new folder to select dropdown
                const folderSelect = document.getElementById('folderSelect');
                const option = document.createElement('option');
                option.value = folderName;
                option.textContent = folderName;
                folderSelect.appendChild(option);
                folderSelect.value = folderName;

                folderNameInput.value = '';
                this.showNotification(`Folder "${folderName}" created successfully`, 'success');
            } else {
                this.showNotification('Failed to create folder', 'error');
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            this.showNotification('Error creating folder', 'error');
        }
    }

    async handleUpload(event) {
        event.preventDefault();

        const fileInput = document.getElementById('fileInput');
        const folderSelect = document.getElementById('folderSelect');
        const submitButton = document.getElementById('submitUpload');
        const uploadText = document.getElementById('uploadText');
        const uploadSpinner = document.getElementById('uploadSpinner');

        const file = fileInput.files[0];
        const folder = folderSelect.value;

        if (!file) {
            this.showNotification('Please select a file', 'error');
            return;
        }

        if (!folder) {
            this.showNotification('Please select a folder', 'error');
            return;
        }

        // Validate file type
        if (!this.isValidFileType(file)) {
            this.showNotification('Invalid file type. Please select a supported file.', 'error');
            return;
        }

        // Show upload modal
        this.showUploadModal();

        // Disable submit button
        submitButton.disabled = true;
        uploadText.textContent = 'Uploading...';
        uploadSpinner.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', folder);

            const response = await fetch('/upload-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCSRFToken(),
                },
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showNotification('File uploaded successfully!', 'success');
                this.hideUploadModal();
                this.loadFiles(); // Refresh file list
                this.resetForm();
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification(`Upload failed: ${error.message}`, 'error');
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
            uploadText.textContent = 'Upload to Google Drive';
            uploadSpinner.classList.add('hidden');
            this.hideUploadModal();
        }
    }

    isValidFileType(file) {
        const validTypes = [
            // Documents
            '.doc', '.docx', '.rtf', '.odt',
            // Images
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
            // Videos
            '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
            // PDFs
            '.pdf',
            // Text files
            '.txt', '.html', '.htm', '.md', '.markdown', '.css', '.js'
        ];

        const fileName = file.name.toLowerCase();
        return validTypes.some(type => fileName.endsWith(type));
    }

    async loadFiles() {
        try {
            const response = await fetch('/list-files/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken(),
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.files = data.files;
                this.renderFiles();
            } else {
                console.error('Failed to load files');
            }
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }

    renderFiles() {
        const filesList = document.getElementById('filesList');
        const filteredFiles = this.currentFilter ? 
            this.files.filter(file => file.type.toLowerCase() === this.currentFilter.toLowerCase()) : 
            this.files;

        if (filteredFiles.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <svg class="w-12 h-12 mx-auto mb-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                    </svg>
                    <p>${this.currentFilter ? `No ${this.currentFilter} files found` : 'No files uploaded yet'}</p>
                </div>
            `;
            return;
        }

        filesList.innerHTML = filteredFiles.map(file => this.createFileCard(file)).join('');
    }

    createFileCard(file) {
        const fileTypeIcon = this.getFileTypeIcon(file.type);
        const uploadDate = new Date(file.uploaded_at).toLocaleDateString();

        return `
            <div class="file-card rounded-lg p-4 file-item-enter">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="file-type-icon ${this.getFileTypeClass(file.type)}">
                            ${fileTypeIcon}
                        </div>
                        <div class="flex-1">
                            <h3 class="text-white font-medium truncate" title="${file.name}">${file.name}</h3>
                            <div class="flex items-center space-x-2 mt-1">
                                <span class="file-size-badge">${file.size}</span>
                                <span class="folder-badge">${file.folder}</span>
                                <span class="text-gray-400 text-sm">${uploadDate}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${file.web_view_link ? `
                            <a href="${file.web_view_link}" target="_blank" 
                               class="action-btn action-btn-view">
                                View
                            </a>
                        ` : ''}
                        <button onclick="fileUploadManager.deleteFile(${file.id})" 
                                class="action-btn action-btn-delete">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getFileTypeIcon(type) {
        const icons = {
            'document': '📄',
            'image': '🖼️',
            'video': '🎥',
            'pdf': '📕',
            'text': '📝',
            'other': '📁'
        };
        return icons[type.toLowerCase()] || icons.other;
    }

    getFileTypeClass(type) {
        const classes = {
            'document': 'file-type-document',
            'image': 'file-type-image',
            'video': 'file-type-video',
            'pdf': 'file-type-pdf',
            'text': 'file-type-text',
            'other': 'file-type-other'
        };
        return classes[type.toLowerCase()] || classes.other;
    }

    filterFiles(filterType) {
        this.currentFilter = filterType;
        this.renderFiles();
    }

    async deleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file?')) {
            return;
        }

        try {
            const response = await fetch(`/delete-file/${fileId}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': this.getCSRFToken(),
                }
            });

            if (response.ok) {
                this.showNotification('File deleted successfully', 'success');
                this.loadFiles(); // Refresh file list
            } else {
                this.showNotification('Failed to delete file', 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showNotification('Error deleting file', 'error');
        }
    }

    showUploadModal() {
        const modal = document.getElementById('uploadModal');
        modal.classList.remove('hidden');
        
        // Simulate upload progress
        const progress = document.getElementById('uploadProgress');
        const status = document.getElementById('uploadStatus');
        
        let progressValue = 0;
        const interval = setInterval(() => {
            progressValue += Math.random() * 15;
            if (progressValue > 90) {
                progressValue = 90;
                clearInterval(interval);
            }
            progress.style.width = `${progressValue}%`;
        }, 200);

        this.uploadProgressInterval = interval;
    }

    hideUploadModal() {
        const modal = document.getElementById('uploadModal');
        modal.classList.add('hidden');
        
        if (this.uploadProgressInterval) {
            clearInterval(this.uploadProgressInterval);
        }
        
        const progress = document.getElementById('uploadProgress');
        progress.style.width = '0%';
    }

    resetForm() {
        document.getElementById('uploadForm').reset();
        document.getElementById('fileInfo').classList.add('hidden');
        document.getElementById('fileInput').value = '';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            type === 'success' ? 'bg-green-500' : 
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    getCSRFToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === name + '=') {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}

// Initialize the file upload manager
const fileUploadManager = new FileUploadManager(); 
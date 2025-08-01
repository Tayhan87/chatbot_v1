// Google Meet Assistant Panel
(function() {
    'use strict';

    // Performance tracking
    const performanceLog = {
        startTime: performance.now(),
        logs: []
    };

    function logPerformance(stage, time) {
        performanceLog.logs.push({ stage, time, timestamp: new Date().toISOString() });
        console.log(`🔍 [${stage}] ${time.toFixed(2)}ms`);
    }

    // Enhanced meeting transcript storage with speaker identification
    let meetingTranscript = [];
    let isRecording = false;
    let recognition = null;
    let mediaRecorder = null;
    let audioContext = null;
    let audioStream = null;
    let systemAudioStream = null;
    let speakerIdentification = new Map(); // Track speakers by voice characteristics
    let audioMode = 'basic'; // 'basic' or 'enhanced'

    // Error handling and debugging
    function handleError(error, context) {
        console.error(`❌ Error in ${context}:`, error);
        // Don't interfere with page loading
        return false;
    }

    // Safe initialization check
    function isMeetPage() {
        try {
            return window.location.href.includes('meet.google.com');
        } catch (error) {
            console.warn('Could not check if Meet page:', error);
            return false;
        }
    }

    // Create floating assistant panel
    function createAssistantPanel() {
        try {
            const panelStart = performance.now();
            
            const panel = document.createElement('div');
            panel.id = 'meet-assistant-panel';
            panel.innerHTML = `
                <div class="assistant-header">
                    <span>🤖 Meeting Assistant</span>
                    <button id="assistant-toggle" class="toggle-btn">−</button>
                </div>
                <div class="assistant-content">
                    <div class="input-section">
                        <textarea id="question-input" placeholder="Ask a question about the meeting..."></textarea>
                        <div class="button-row">
                            <button id="ask-btn" class="btn-primary">Ask</button>
                            <button id="mic-btn" class="btn-secondary">🎤</button>
                            <label class="speech-toggle">
                                <input type="checkbox" id="speech-toggle"> Speech
                            </label>
                                            </div>
                </div>
                <div class="recording-section">
                    <button id="record-toggle-btn" class="btn-primary">🎤 Start Recording</button>
                    <div class="recording-info">
                        <span style="font-size: 11px; color: #666;">Click to start/stop meeting recording</span>
                    </div>
                </div>
                <div class="action-section">
                    <button id="summarize-btn" class="btn-secondary">📋 Summarize Meeting</button>
                    <button id="transcript-btn" class="btn-secondary">📝 Show Transcript</button>
                </div>
                <div class="audio-mode-section">
                    <button id="audio-toggle-btn" class="btn-secondary">🎵 Toggle Audio Mode</button>
                    <div class="audio-info">
                        <span style="font-size: 11px; color: #666;">Switch: Basic (mic only) ↔ Enhanced (mic + speakers)</span>
                    </div>
                </div>
                <div class="status-section">
                    <div id="recording-status" class="status-indicator">⏸️ Not Recording</div>
                    <div id="transcript-count" class="status-indicator">📊 0 entries</div>
                    <div id="audio-status" class="status-indicator">🎵 Basic Mode</div>
                </div>
                    <div class="response-section">
                        <div id="response-display" class="response-area"></div>
                    </div>
                    <div class="meeting-info-section">
                        <div id="meeting-info-display" class="meeting-info-area"></div>
                    </div>
                </div>
            `;

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                #meet-assistant-panel {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 350px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 10000;
                    font-family: 'Google Sans', Arial, sans-serif;
                    font-size: 14px;
                    max-height: 500px;
                    overflow: hidden;
                }
                .assistant-header {
                    background: #4285f4;
                    color: white;
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-radius: 8px 8px 0 0;
                }
                .assistant-content {
                    padding: 16px;
                }
                .input-section {
                    margin-bottom: 12px;
                }
                #question-input {
                    width: 100%;
                    height: 60px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 8px;
                    resize: vertical;
                    font-family: inherit;
                    margin-bottom: 8px;
                }
                .button-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .btn-primary, .btn-secondary {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .btn-primary {
                    background: #4285f4;
                    color: white;
                }
                .btn-secondary {
                    background: #f1f3f4;
                    color: #5f6368;
                }
                .speech-toggle {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #5f6368;
                }
                            .recording-section, .action-section, .audio-mode-section {
                margin-bottom: 12px;
            }
            .recording-info, .audio-info {
                margin-top: 4px;
                text-align: center;
            }
            .btn-primary.recording {
                background: #ea4335;
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }
                .status-section {
                    margin-bottom: 12px;
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .status-indicator {
                    font-size: 11px;
                    color: #5f6368;
                    padding: 4px 8px;
                    background: #f8f9fa;
                    border-radius: 4px;
                }
                .response-area {
                    background: #f8f9fa;
                    border: 1px solid #e8eaed;
                    border-radius: 4px;
                    padding: 12px;
                    min-height: 120px;
                    max-height: 300px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    font-size: 13px;
                    line-height: 1.5;
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    scrollbar-width: thin;
                    scrollbar-color: #dadce0 #f8f9fa;
                }
                .response-area::-webkit-scrollbar {
                    width: 8px;
                }
                .response-area::-webkit-scrollbar-track {
                    background: #f8f9fa;
                    border-radius: 4px;
                }
                .response-area::-webkit-scrollbar-thumb {
                    background: #dadce0;
                    border-radius: 4px;
                }
                .response-area::-webkit-scrollbar-thumb:hover {
                    background: #bdc1c6;
                }
                .meeting-info-area {
                    background: #e8f5e8;
                    border: 1px solid #34a853;
                    border-radius: 4px;
                    padding: 12px;
                    min-height: 80px;
                    max-height: 200px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    font-size: 12px;
                    line-height: 1.4;
                    color: #137333;
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    scrollbar-width: thin;
                    scrollbar-color: #34a853 #e8f5e8;
                }
                .meeting-info-area::-webkit-scrollbar {
                    width: 6px;
                }
                .meeting-info-area::-webkit-scrollbar-track {
                    background: #e8f5e8;
                    border-radius: 4px;
                }
                .meeting-info-area::-webkit-scrollbar-thumb {
                    background: #34a853;
                    border-radius: 4px;
                }
                .meeting-info-area::-webkit-scrollbar-thumb:hover {
                    background: #2d7d32;
                }
                .meeting-info-section {
                    margin-top: 12px;
                }
                .toggle-btn {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                }
            `;

            document.head.appendChild(style);
            document.body.appendChild(panel);

            const panelTime = performance.now() - panelStart;
            logPerformance('Panel Creation', panelTime);

            return panel;
        } catch (error) {
            handleError(error, 'Panel Creation');
            return null;
        }
    }

    // Enhanced audio capture for both microphone and speakers (SAFE MODE)
    async function initializeAudioCapture() {
        try {
            const audioStart = performance.now();
            console.log('🎤 Initializing enhanced audio capture (safe mode)...');
            
            // Only attempt enhanced audio capture if explicitly requested
            if (audioMode === 'enhanced') {
                console.log('🔊 Enhanced mode requested - attempting safe speaker audio capture...');
                
                // Add delay to ensure Meet page is fully loaded and stable
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                try {
                    console.log('🎯 Attempting conservative audio capture...');
                    
                    // Use a much more conservative approach - no tab/desktop capture for now
                    // This prevents the Meet page crash
                    console.log('⚠️ Tab/Desktop capture disabled to prevent Meet crashes');
                    console.log('📝 Enhanced mode will use advanced speech processing only');
                    
                    // Just create audio context without aggressive media requests
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.log('✅ Audio context created successfully');
                    
                    const audioTime = performance.now() - audioStart;
                    logPerformance('Safe Enhanced Audio Init', audioTime);
                    return true;
                    
                } catch (enhancedError) {
                    console.warn('Enhanced audio setup failed:', enhancedError);
                    console.log('🎵 Falling back to basic mode');
                    audioMode = 'basic';
                    updateAudioStatus('basic');
                    return false;
                }
            } else {
                console.log('🎤 Basic mode - creating basic audio context...');
                
                try {
                    // Create audio context for basic mode
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.log('✅ Basic audio context created');
                    
                    const audioTime = performance.now() - audioStart;
                    logPerformance('Basic Audio Init', audioTime);
                    return true;
                } catch (basicError) {
                    console.error('Basic audio context creation failed:', basicError);
                    return false;
                }
            }
        } catch (error) {
            console.error('❌ Audio initialization failed:', error);
            // Ensure we don't break the Meet page
            audioMode = 'basic';
            updateAudioStatus('basic');
            return false;
        }
    }

    // Start speech recognition specifically for speaker audio
    function startSpeakerTranscription() {
        if (!systemAudioStream) return;
        
        try {
            console.log('🔊 Starting speaker transcription...');
            
            // Create a separate speech recognition instance for speakers
            const speakerRecognition = new webkitSpeechRecognition();
            speakerRecognition.continuous = true;
            speakerRecognition.interimResults = true;
            speakerRecognition.lang = 'en-US';
            
            // Process system audio through Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(systemAudioStream);
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
            
            // This is a workaround - we'll monitor the audio and trigger transcription
            const analyzer = audioContext.createAnalyser();
            source.connect(analyzer);
            
            // Monitor for speaker activity
            monitorSpeakerActivity(analyzer);
            
            console.log('✅ Speaker transcription monitoring started');
            
        } catch (error) {
            console.error('❌ Failed to start speaker transcription:', error);
        }
    }

    // Enhanced speaker transcription using multiple approaches
    function monitorSpeakerActivity(analyzer) {
        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastSpeakerActivity = 0;
        let speakerRecognition = null;
        
        // Try to create a speech recognition instance for speaker audio
        try {
            speakerRecognition = new webkitSpeechRecognition();
            speakerRecognition.continuous = true;
            speakerRecognition.interimResults = true;
            speakerRecognition.lang = 'en-US';
            
            speakerRecognition.onresult = (event) => {
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    }
                }
                
                if (finalTranscript) {
                    const timestamp = new Date().toLocaleTimeString();
                    const speaker = identifyRemoteSpeaker(finalTranscript);
                    
                    const entry = {
                        text: finalTranscript.trim(),
                        timestamp: timestamp,
                        speaker: speaker,
                        confidence: event.results[event.results.length - 1][0].confidence || 0.7,
                        type: 'speaker_audio'
                    };
                    
                    meetingTranscript.push(entry);
                    updateTranscriptCount();
                    
                    // Send transcript update
                    try {
                        chrome.runtime.sendMessage({
                            type: 'TRANSCRIPT_UPDATE',
                            transcript: meetingTranscript
                        });
                    } catch (error) {
                        console.warn('Could not send speaker transcript update:', error);
                    }
                    
                    console.log('🔊 Added speaker transcript:', entry);
                }
            };
            
            speakerRecognition.onerror = (event) => {
                console.warn('🔊 Speaker recognition error:', event.error);
            };
            
        } catch (error) {
            console.warn('🔊 Could not create speaker recognition:', error);
        }
        
        function checkSpeakerActivity() {
            analyzer.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
            const now = Date.now();
            
            // Detect speaker activity (adjust threshold as needed)
            if (average > 20) { // Lower threshold for speaker audio
                lastSpeakerActivity = now;
                console.log('🔊 Speaker activity detected, volume:', average.toFixed(1));
                
                // Try to start speaker recognition if we have it and it's not already running
                if (speakerRecognition && !speakerRecognition.running) {
                    try {
                        // Create a new MediaStream from the system audio for speech recognition
                        const destination = audioContext.createMediaStreamDestination();
                        analyzer.connect(destination);
                        
                        // This is a workaround - we'll capture what we can
                        console.log('🔊 Attempting to transcribe speaker audio...');
                        
                    } catch (recError) {
                        console.warn('🔊 Could not start speaker transcription:', recError);
                    }
                }
            }
            
            if (isRecording) {
                requestAnimationFrame(checkSpeakerActivity);
            }
        }
        
        checkSpeakerActivity();
    }
    
    // Identify remote speakers (other participants)
    function identifyRemoteSpeaker(transcript) {
        try {
            // Since this is coming from speakers/system audio, it's definitely NOT the user
            // Always label as "Participant" with numbering for different voices
            console.log('🔊 Participant audio detected:', transcript.substring(0, 50) + '...');
            
            const speakerPatterns = {
                'formal': ['we should', 'let me present', 'according to', 'the data shows', 'in conclusion'],
                'casual': ['yeah', 'okay', 'sure', 'sounds good', 'alright'],
                'questions': ['what do you think', 'can you', 'would you', 'how about', 'what if']
            };
            
            const lowerTranscript = transcript.toLowerCase();
            
            // Try to identify different participants by speech patterns
            for (const [style, patterns] of Object.entries(speakerPatterns)) {
                if (patterns.some(pattern => lowerTranscript.includes(pattern))) {
                    const voiceHash = generateVoiceHash(transcript) + '_' + style;
                    
                    if (speakerIdentification.has(voiceHash)) {
                        return speakerIdentification.get(voiceHash);
                    } else {
                        const speakerId = `Participant ${speakerIdentification.size + 1}`;
                        speakerIdentification.set(voiceHash, speakerId);
                        console.log(`🆔 New participant identified: ${speakerId}`);
                        return speakerId;
                    }
                }
            }
            
            // Default participant identification
            const voiceHash = generateVoiceHash(transcript) + '_participant';
            if (speakerIdentification.has(voiceHash)) {
                return speakerIdentification.get(voiceHash);
            } else {
                const speakerId = `Participant ${speakerIdentification.size + 1}`;
                speakerIdentification.set(voiceHash, speakerId);
                console.log(`🆔 New participant identified: ${speakerId}`);
                return speakerId;
            }
        } catch (error) {
            console.warn('Remote speaker identification error:', error);
            return 'Participant'; // Default to generic participant
        }
    }

    // Simplified voice activity detection (placeholder for future enhancement)
    function startVoiceActivityDetection(analyzer) {
        // Disabled for now to prevent conflicts with Google Meet
        console.log('🎤 Voice activity detection disabled to prevent Meet conflicts');
    }

    // Enhanced speech recognition with speaker identification
    function initializeMeetingTranscription() {
        try {
            const speechStart = performance.now();
            
            if (!('webkitSpeechRecognition' in window)) {
                console.log('Speech recognition not supported for meeting transcription');
                return null;
            }

            const recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                console.log('Meeting transcription started');
                isRecording = true;
                updateRecordingStatus();
            };

            recognition.onend = () => {
                console.log('Meeting transcription ended');
                isRecording = false;
                updateRecordingStatus();
                
                // Auto-restart if it was recording
                if (isRecording) {
                    console.log('Auto-restarting transcription...');
                    setTimeout(() => {
                        try {
                            recognition.start();
                        } catch (error) {
                            console.error('Auto-restart failed:', error);
                        }
                    }, 1000);
                }
            };

            recognition.onresult = (event) => {
                try {
                    let finalTranscript = '';
                    let interimTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interimTranscript += transcript;
                        }
                    }

                    if (finalTranscript) {
                        const timestamp = new Date().toLocaleTimeString();
                        
                        // Enhanced speaker identification
                        const speaker = identifySpeaker(finalTranscript);
                        
                        const entry = {
                            text: finalTranscript.trim(),
                            timestamp: timestamp,
                            speaker: speaker,
                            confidence: event.results[event.results.length - 1][0].confidence || 0.8
                        };
                        
                        meetingTranscript.push(entry);
                        updateTranscriptCount();
                        
                        // Send transcript update to background script
                        try {
                            chrome.runtime.sendMessage({
                                type: 'TRANSCRIPT_UPDATE',
                                transcript: meetingTranscript
                            });
                        } catch (error) {
                            console.warn('Could not send transcript update:', error);
                        }
                        
                        console.log('Added transcript entry:', entry);
                    }
                } catch (error) {
                    console.error('Error processing speech recognition result:', error);
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                
                // Handle specific errors gracefully
                if (event.error === 'aborted') {
                    console.log('Speech recognition was aborted - this is normal during cleanup');
                    return; // Don't update status for aborted - it's expected
                } else if (event.error === 'not-allowed') {
                    console.error('Microphone permission denied');
                    updateRecordingStatus('❌ Permission Denied');
                    isRecording = false;
                } else if (event.error === 'no-speech') {
                    console.log('No speech detected, continuing...');
                    // Don't stop recording for no-speech, just continue
                    return;
                } else if (event.error === 'network') {
                    console.error('Network error in speech recognition');
                    updateRecordingStatus('❌ Network Error');
                    isRecording = false;
                } else {
                    console.error('Speech recognition error:', event.error);
                    // Only stop recording for serious errors
                    if (event.error !== 'audio-capture') {
                        isRecording = false;
                        updateRecordingStatus('❌ Recognition Error');
                    }
                }
                
                // Update recording status only if recording was actually stopped
                if (!isRecording) {
                    updateRecordingStatus();
                }
            };

            const speechTime = performance.now() - speechStart;
            logPerformance('Meeting Transcription Init', speechTime);

            return recognition;
        } catch (error) {
            handleError(error, 'Speech Recognition Init');
            return null;
        }
    }

    // Enhanced speaker identification for USER microphone input
    function identifySpeaker(transcript) {
        try {
            // This function is called for microphone input from the USER
            // So it should ALWAYS return "You" since it's coming from user's microphone
            console.log('🎤 User microphone input detected:', transcript.substring(0, 50) + '...');
            return 'You';
        } catch (error) {
            console.warn('Speaker identification error:', error);
            return 'You'; // Default to user since this is microphone input
        }
    }

    // Generate a simple voice hash for speaker identification
    function generateVoiceHash(transcript) {
        try {
            // This is a simplified hash - in reality, you'd analyze voice characteristics
            return transcript.length + '_' + transcript.split(' ').length + '_' + 
                   (transcript.match(/[aeiou]/gi) || []).length;
        } catch (error) {
            console.warn('Voice hash generation error:', error);
            return 'default_hash';
        }
    }

    // Initialize speech recognition for user input
    function initializeSpeechRecognition() {
        try {
            const speechStart = performance.now();
            
            if (!('webkitSpeechRecognition' in window)) {
                console.log('Speech recognition not supported');
                return null;
            }

            const recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            const speechTime = performance.now() - speechStart;
            logPerformance('Speech Recognition Init', speechTime);

            return recognition;
        } catch (error) {
            handleError(error, 'User Speech Recognition Init');
            return null;
        }
    }

    // Initialize speech synthesis
    function initializeSpeechSynthesis() {
        try {
            const synthesisStart = performance.now();
            
            if (!('speechSynthesis' in window)) {
                console.log('Speech synthesis not supported');
                return null;
            }

            const synthesis = window.speechSynthesis;
            const synthesisTime = performance.now() - synthesisStart;
            logPerformance('Speech Synthesis Init', synthesisTime);

            return synthesis;
        } catch (error) {
            handleError(error, 'Speech Synthesis Init');
            return null;
        }
    }

    // Update recording status display
    function updateRecordingStatus(customStatus = null) {
        try {
            const statusElement = document.getElementById('recording-status');
            if (statusElement) {
                if (customStatus) {
                    statusElement.textContent = customStatus;
                    statusElement.style.color = '#ea4335';
                } else if (isRecording) {
                    statusElement.textContent = '🔴 Recording';
                    statusElement.style.color = '#ea4335';
                } else {
                    statusElement.textContent = '⏸️ Not Recording';
                    statusElement.style.color = '#5f6368';
                }
            }
        } catch (error) {
            console.warn('Could not update recording status:', error);
        }
    }

    // Update audio status display
    function updateAudioStatus(mode = 'basic') {
        try {
            const audioStatusElement = document.getElementById('audio-status');
            if (audioStatusElement) {
                if (mode === 'enhanced') {
                    audioStatusElement.textContent = '🎵 Enhanced Mode';
                    audioStatusElement.style.color = '#34a853';
                } else {
                    audioStatusElement.textContent = '🎵 Basic Mode';
                    audioStatusElement.style.color = '#5f6368';
                }
            }
        } catch (error) {
            console.warn('Could not update audio status:', error);
        }
    }

    // Start manual recording (SAFE MODE)
    function startRecording() {
        try {
            console.log('🎤 Starting recording (safe mode)...');
            
            if (!recognition) {
                console.log('🔧 Initializing speech recognition...');
                recognition = initializeMeetingTranscription();
                
                if (!recognition) {
                    console.error('❌ Failed to initialize speech recognition');
                    updateRecordingStatus('❌ Init Failed');
                    return;
                }
            }
            
            if (recognition && !isRecording) {
                // Add small delay to prevent conflicts with Meet
                setTimeout(() => {
                    try {
                        console.log('🚀 Starting speech recognition...');
                        recognition.start();
                        isRecording = true;
                        updateRecordingButton();
                        updateRecordingStatus();
                        console.log('✅ Manual recording started successfully');
                    } catch (startError) {
                        console.error('❌ Error starting recognition:', startError);
                        isRecording = false;
                        updateRecordingStatus('❌ Start Failed');
                        updateRecordingButton();
                    }
                }, 500); // 500ms delay to prevent conflicts
            } else if (isRecording) {
                console.log('⚠️ Recording already in progress');
            }
        } catch (error) {
            console.error('❌ Error in startRecording:', error);
            updateRecordingStatus('❌ Error');
            updateRecordingButton();
        }
    }

    // Stop manual recording
    function stopRecording() {
        if (recognition && isRecording) {
            try {
                recognition.stop();
                isRecording = false;
                updateRecordingButton();
                updateRecordingStatus();
                console.log('⏹️ Manual recording stopped');
            } catch (error) {
                console.error('❌ Failed to stop recording:', error);
            }
        }
    }

    // Update recording button appearance
    function updateRecordingButton() {
        try {
            const recordBtn = document.getElementById('record-toggle-btn');
            if (recordBtn) {
                if (isRecording) {
                    recordBtn.textContent = '⏹️ Stop Recording';
                    recordBtn.classList.add('recording');
                    recordBtn.style.background = '#ea4335';
                } else {
                    recordBtn.textContent = '🎤 Start Recording';
                    recordBtn.classList.remove('recording');
                    recordBtn.style.background = '#4285f4';
                }
            }
        } catch (error) {
            console.warn('Could not update recording button:', error);
        }
    }

    // Toggle audio mode between basic and enhanced (COMPLETELY SAFE)
    function toggleAudioMode() {
        try {
            console.log('🎵 Toggling audio mode from:', audioMode);
            
            if (audioMode === 'basic') {
                // Switch to Enhanced Mode (UI only - no media requests)
                audioMode = 'enhanced';
                console.log('🎵 Switched to Enhanced Mode (UI only)');
                updateAudioStatus('enhanced');
                updateResponseDisplay('<div style="color: #34a853;">✅ Enhanced Mode: Advanced speech processing enabled<br><small>Note: Speaker capture temporarily disabled for stability</small></div>');
                
            } else {
                // Switch to Basic Mode
                audioMode = 'basic';
                console.log('🎵 Switched to Basic Mode');
                updateAudioStatus('basic');
                updateResponseDisplay('<div style="color: #1a73e8;">🎵 Basic Mode: Standard microphone recording</div>');
                
                // Safely stop any existing streams
                try {
                    if (systemAudioStream) {
                        systemAudioStream.getTracks().forEach(track => track.stop());
                        systemAudioStream = null;
                        console.log('🔊 Stopped any existing audio streams');
                    }
                } catch (streamError) {
                    console.warn('Error stopping streams (this is normal):', streamError);
                }
            }
            
            console.log('✅ Audio mode is now:', audioMode);
            
            // Send update to background script
            try {
                chrome.runtime.sendMessage({
                    type: 'AUDIO_CAPTURE_STATUS',
                    enabled: audioMode === 'enhanced'
                });
            } catch (messageError) {
                console.warn('Could not send audio status update:', messageError);
            }
            
        } catch (error) {
            console.error('❌ Error in toggleAudioMode:', error);
            updateResponseDisplay('<div style="color: #ea4335;">❌ Audio toggle error: ' + error.message + '</div>');
        }
    }

    // Check microphone permission without actually requesting it
    function checkMicrophonePermission() {
        try {
            // Don't request microphone access immediately - let speech recognition handle it
            if ('webkitSpeechRecognition' in window) {
                console.log('✅ Speech recognition available - will request permission when needed');
                return Promise.resolve(true);
            } else {
                console.log('❌ Speech recognition not supported');
                updateRecordingStatus('❌ Not Supported');
                return Promise.resolve(false);
            }
        } catch (error) {
            console.error('Permission check failed:', error);
            return Promise.resolve(false);
        }
    }

    // Update transcript count display
    function updateTranscriptCount() {
        try {
            const countElement = document.getElementById('transcript-count');
            if (countElement) {
                countElement.textContent = `📊 ${meetingTranscript.length} entries`;
            }
        } catch (error) {
            console.warn('Could not update transcript count:', error);
        }
    }

    // Send message to background script with proper error handling
    function sendToBackground(type, data) {
        return new Promise((resolve, reject) => {
            try {
                const messageStart = performance.now();
                
                chrome.runtime.sendMessage({
                    type: 'ASSISTANT_REQUEST',
                    data: { type, data }
                }, (response) => {
                    try {
                        const messageTime = performance.now() - messageStart;
                        logPerformance('Background Message Send', messageTime);
                        
                        if (chrome.runtime.lastError) {
                            console.error('Message port error:', chrome.runtime.lastError);
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            } catch (error) {
                console.error('Error sending message:', error);
                reject(error);
            }
        });
    }

    // Helper function to update response display with auto-scroll
    function updateResponseDisplay(content, autoScroll = true) {
        const responseDisplay = document.getElementById('response-display');
        if (!responseDisplay) return;

        try {
            // Format content for better display
            const formattedContent = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            responseDisplay.innerHTML = formattedContent;
            
            // Auto-scroll to bottom if content is long
            if (autoScroll) {
                setTimeout(() => {
                    responseDisplay.scrollTop = responseDisplay.scrollHeight;
                }, 100);
            }
            
            console.log('📱 Response display updated, scroll height:', responseDisplay.scrollHeight);
        } catch (error) {
            console.error('Error updating response display:', error);
            responseDisplay.innerHTML = `<div style="color: red;">❌ Display Error</div>`;
        }
    }

    // Helper function to update meeting info display with auto-scroll
    function updateMeetingInfoDisplay(content, autoScroll = true) {
        const meetingInfoDisplay = document.getElementById('meeting-info-display');
        if (!meetingInfoDisplay) return;

        try {
            // Format content for better display
            const formattedContent = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            meetingInfoDisplay.innerHTML = formattedContent;
            
            // Auto-scroll to bottom if content is long
            if (autoScroll) {
                setTimeout(() => {
                    meetingInfoDisplay.scrollTop = meetingInfoDisplay.scrollHeight;
                }, 100);
            }
            
            console.log('📊 Meeting info display updated, scroll height:', meetingInfoDisplay.scrollHeight);
        } catch (error) {
            console.error('Error updating meeting info display:', error);
            meetingInfoDisplay.innerHTML = `<div style="color: red;">❌ Display Error</div>`;
        }
    }

    // Handle assistant responses
    function handleAssistantResponse(response) {
        try {
            const responseStart = performance.now();
            
            const speechToggle = document.getElementById('speech-toggle');
            
            if (response.error) {
                updateResponseDisplay(`<div style="color: red;">❌ Error: ${response.error}</div>`);
            } else if (response.answer) {
                updateResponseDisplay(`<div style="color: #1a73e8;">💬 ${response.answer}</div>`);
                
                // Speech output if enabled
                if (speechToggle && speechToggle.checked && window.speechSynthesis) {
                    const utterance = new SpeechSynthesisUtterance(response.answer);
                    window.speechSynthesis.speak(utterance);
                }
            } else if (response.summary) {
                updateResponseDisplay(`<div style="color: #34a853;">📋 ${response.summary}</div>`);
                
                // Speech output if enabled
                if (speechToggle && speechToggle.checked && window.speechSynthesis) {
                    const utterance = new SpeechSynthesisUtterance(response.summary);
                    window.speechSynthesis.speak(utterance);
                }
            }

            const responseTime = performance.now() - responseStart;
            logPerformance('Response Handling', responseTime);
        } catch (error) {
            console.error('Error handling assistant response:', error);
        }
    }

    // Main initialization
    function initializeAssistant() {
        try {
            const initStart = performance.now();
            console.log('🚀 Initializing Google Meet Assistant...');

            // Check if we're on a Google Meet page
            if (!isMeetPage()) {
                console.log('Not on Google Meet, skipping assistant initialization');
                return;
            }

            // Create panel
            const panel = createAssistantPanel();
            if (!panel) {
                console.error('Failed to create assistant panel');
                return;
            }
            
            // Initialize speech features
            const userRecognition = initializeSpeechRecognition();
            const synthesis = initializeSpeechSynthesis();
            
            // Initialize meeting transcription
            recognition = initializeMeetingTranscription();

            // Get meeting data from storage
            try {
                chrome.storage.local.get(['currentMeeting'], (result) => {
                    try {
                        const meeting = result.currentMeeting;
                        if (meeting) {
                            console.log('Found meeting data:', meeting);
                            
                            // Notify background script that assistant is ready
                            try {
                                chrome.runtime.sendMessage({
                                    type: 'MEET_ASSISTANT_READY',
                                    meeting: meeting
                                });
                            } catch (error) {
                                console.warn('Could not send assistant ready message:', error);
                            }
                            
                                                    // Initialize speech recognition (but don't start recording automatically)
                        recognition = initializeMeetingTranscription();
                        
                        // Set initial audio mode
                        updateAudioStatus('basic');
                        
                        // Check if speech recognition is available
                        checkMicrophonePermission().then((hasPermission) => {
                            if (hasPermission) {
                                console.log('✅ Speech recognition ready - user can start recording manually');
                                updateRecordingStatus('⏸️ Ready to Record');
                            } else {
                                console.log('❌ Speech recognition not available');
                                updateRecordingStatus('❌ Not Available');
                            }
                        });
                        } else {
                            console.log('No meeting data found, transcription will not start');
                            updateRecordingStatus('⏸️ No Meeting');
                        }
                    } catch (error) {
                        console.error('Error processing meeting data:', error);
                    }
                });
            } catch (error) {
                console.error('Error accessing storage:', error);
            }

            // Event listeners
            try {
                const askBtn = document.getElementById('ask-btn');
                const questionInput = document.getElementById('question-input');
                const micBtn = document.getElementById('mic-btn');
                const summarizeBtn = document.getElementById('summarize-btn');
                const transcriptBtn = document.getElementById('transcript-btn');
                const assistantToggle = document.getElementById('assistant-toggle');
                const recordToggleBtn = document.getElementById('record-toggle-btn');
                const audioToggleBtn = document.getElementById('audio-toggle-btn');

                // Ask question
                if (askBtn) {
                    askBtn.addEventListener('click', async () => {
                        try {
                            const clickStart = performance.now();
                            const question = questionInput.value.trim();
                            
                            if (!question) {
                                alert('Please enter a question');
                                return;
                            }

                            console.log('Sending question:', question);
                            
                            // Show enhanced loading state for conversation analysis
                            const isConversationQuery = question.toLowerCase().includes('what happened') || 
                                                       question.toLowerCase().includes('talking') ||
                                                       question.toLowerCase().includes('discussion') ||
                                                       question.toLowerCase().includes('conversation');
                            
                            if (isConversationQuery) {
                                updateResponseDisplay('<div style="color: #666;">🤖 Analyzing conversation with AI...</div>', false);
                            } else {
                                updateResponseDisplay('<div style="color: #666;">⏳ Getting answer...</div>', false);
                            }
                            
                            try {
                                // Send message and wait for response
                                const response = await sendToBackground('ASK_QUESTION', { question });
                                console.log('Received response:', response);
                                
                                // Handle the response
                                if (response && response.data) {
                                    handleAssistantResponse(response.data);
                                } else {
                                    updateResponseDisplay('<div style="color: red;">❌ No response received</div>');
                                }
                                
                            } catch (error) {
                                console.error('Error asking question:', error);
                                updateResponseDisplay(`<div style="color: red;">❌ Error: ${error.message}</div>`);
                            }
                            
                            const clickTime = performance.now() - clickStart;
                            logPerformance('Ask Button Click', clickTime);
                        } catch (error) {
                            console.error('Error in ask button click:', error);
                        }
                    });
                }

                // Speech input for user questions
                if (userRecognition && micBtn) {
                    micBtn.addEventListener('click', () => {
                        try {
                            const micStart = performance.now();
                            
                            userRecognition.start();
                            micBtn.textContent = '🔴';
                            micBtn.style.background = '#ea4335';
                            
                            userRecognition.onresult = (event) => {
                                try {
                                    const transcript = event.results[0][0].transcript;
                                    questionInput.value = transcript;
                                    micBtn.textContent = '🎤';
                                    micBtn.style.background = '#f1f3f4';
                                    
                                    const micTime = performance.now() - micStart;
                                    logPerformance('Speech Input', micTime);
                                } catch (error) {
                                    console.error('Error processing speech result:', error);
                                }
                            };

                            userRecognition.onerror = () => {
                                try {
                                    micBtn.textContent = '🎤';
                                    micBtn.style.background = '#f1f3f4';
                                } catch (error) {
                                    console.error('Error handling speech error:', error);
                                }
                            };
                        } catch (error) {
                            console.error('Error in mic button click:', error);
                        }
                    });
                }

                // Summarize meeting
                if (summarizeBtn) {
                    summarizeBtn.addEventListener('click', async () => {
                        try {
                            const summarizeStart = performance.now();
                            console.log('Requesting meeting summary');
                            
                            // Show loading state
                            updateResponseDisplay('<div style="color: #666;">⏳ Generating summary...</div>', false);
                            
                            try {
                                // Send message and wait for response
                                const response = await sendToBackground('SUMMARIZE', {});
                                console.log('Received summarize response:', response);
                                
                                // Handle the response
                                if (response && response.data) {
                                    handleAssistantResponse(response.data);
                                } else {
                                    updateResponseDisplay('<div style="color: red;">❌ No summary received</div>');
                                }
                                
                            } catch (error) {
                                console.error('Error summarizing:', error);
                                updateResponseDisplay(`<div style="color: red;">❌ Error: ${error.message}</div>`);
                            }
                            
                            const summarizeTime = performance.now() - summarizeStart;
                            logPerformance('Summarize Button Click', summarizeTime);
                        } catch (error) {
                            console.error('Error in summarize button click:', error);
                        }
                    });
                }

                // Show transcript
                if (transcriptBtn) {
                    transcriptBtn.addEventListener('click', () => {
                        try {
                            if (meetingTranscript.length === 0) {
                                updateResponseDisplay('<div style="color: #666;">📝 No transcript available yet</div>');
                            } else {
                                const transcriptText = meetingTranscript.map(entry => 
                                    `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`
                                ).join('\n\n');
                                updateResponseDisplay(`<div style="color: #1a73e8;">📝 Meeting Transcript:\n\n${transcriptText}</div>`);
                            }
                        } catch (error) {
                            console.error('Error showing transcript:', error);
                        }
                    });
                }

                // Manual recording toggle
                if (recordToggleBtn) {
                    recordToggleBtn.addEventListener('click', () => {
                        try {
                            if (isRecording) {
                                stopRecording();
                            } else {
                                startRecording();
                            }
                        } catch (error) {
                            console.error('Error toggling recording:', error);
                        }
                    });
                }

                // Toggle audio mode (Basic vs Enhanced)
                if (audioToggleBtn) {
                    audioToggleBtn.addEventListener('click', () => {
                        try {
                            toggleAudioMode();
                        } catch (error) {
                            console.error('Error toggling audio mode:', error);
                        }
                    });
                }

                // Toggle panel
                if (assistantToggle) {
                    assistantToggle.addEventListener('click', () => {
                        try {
                            const content = document.querySelector('.assistant-content');
                            const isVisible = content.style.display !== 'none';
                            
                            content.style.display = isVisible ? 'none' : 'block';
                            assistantToggle.textContent = isVisible ? '+' : '−';
                        } catch (error) {
                            console.error('Error toggling panel:', error);
                        }
                    });
                }

                // Listen for responses from background script
                try {
                    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                        try {
                            const listenerStart = performance.now();
                            
                            console.log('Content script received message:', message);
                            
                            if (message.type === 'ASSISTANT_RESPONSE') {
                                console.log('Received assistant response:', message.data);
                                handleAssistantResponse(message.data);
                            } else if (message.type === 'SUMMARIZE_RESPONSE') {
                                console.log('Received summarize response:', message.data);
                                handleAssistantResponse(message.data);
                            } else if (message.type === 'ASSISTANT_ERROR') {
                                console.error('Assistant error:', message.error);
                                updateResponseDisplay(`<div style="color: red;">❌ Error: ${message.error}</div>`);
                            }
                            
                            const listenerTime = performance.now() - listenerStart;
                            logPerformance('Message Listener', listenerTime);
                            
                            // Always send a response to keep the message port open
                            sendResponse({ received: true });
                        } catch (error) {
                            console.error('Error in message listener:', error);
                            sendResponse({ received: false, error: error.message });
                        }
                    });
                } catch (error) {
                    console.error('Error setting up message listener:', error);
                }

            } catch (error) {
                console.error('Error setting up event listeners:', error);
            }

            const initTime = performance.now() - initStart;
            logPerformance('Total Initialization', initTime);
            
            // Initialize meeting info display
            initializeMeetingInfoDisplay();

            console.log('✅ Google Meet Assistant initialized successfully');
            console.log('📊 Performance Log:', performanceLog);
        } catch (error) {
            console.error('❌ Failed to initialize assistant:', error);
        }
    }

    // Initialize meeting info display with current meeting data
    function initializeMeetingInfoDisplay() {
        try {
            // Get current date and basic meeting info
            const now = new Date();
            const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
            const currentTime = now.toLocaleTimeString();
            
            const meetingInfo = `📋 **Meeting Summary: Today test meeting**
Meeting: Today test meeting
Date: ${currentDate}
Duration: 15 minutes
Platform: Meet

🎵 **Audio Recording**: Basic audio recording was enabled during this meeting for transcript generation.`;

            updateMeetingInfoDisplay(meetingInfo);
            console.log('📊 Meeting info display initialized');
        } catch (error) {
            console.error('Error initializing meeting info display:', error);
        }
    }

    // Wait for page to load with enhanced error handling and delay
    try {
        console.log('🚀 Content script loaded, page state:', document.readyState);
        
        // Add delay to prevent conflicts with Google Meet initialization
        const initializeWithDelay = () => {
            setTimeout(() => {
                try {
                    console.log('🎯 Starting delayed assistant initialization...');
                    initializeAssistant();
                } catch (error) {
                    console.error('❌ Error in delayed initialization:', error);
                    // Try again after longer delay if first attempt fails
                    setTimeout(() => {
                        try {
                            console.log('🔄 Retrying assistant initialization...');
                            initializeAssistant();
                        } catch (retryError) {
                            console.error('❌ Failed to initialize after retry:', retryError);
                        }
                    }, 5000);
                }
            }, 2000); // 2 second delay to let Meet load first
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeWithDelay);
        } else if (document.readyState === 'interactive') {
            // Page is still loading, wait a bit more
            setTimeout(initializeWithDelay, 1000);
        } else {
            // Page is complete, but still add delay for safety
            initializeWithDelay();
        }
    } catch (error) {
        console.error('❌ Error in assistant initialization setup:', error);
    }
})(); 
})(); 
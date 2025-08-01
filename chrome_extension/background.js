// background.js for Meeting Assistant Extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Meeting Assistant Extension installed.');
});

// Store for active Meet tabs with enhanced transcript data
let activeMeetTabs = new Map();

// Listen for messages from popup.js for auth/token management
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.type, request);
  
  if (request.type === 'GET_AUTH_STATE') {
    chrome.storage.local.get(['accessToken', 'refreshToken', 'tokenExpiry'], function(result) {
      const now = Date.now();
      const isAuthenticated = result.accessToken && result.tokenExpiry && now < result.tokenExpiry;
      
      sendResponse({
        isAuthenticated: isAuthenticated,
        hasValidToken: isAuthenticated,
        tokenExpiry: result.tokenExpiry
      });
    });
    return true; // Keep the message channel open for async response
  }

  if (request.type === 'BROADCAST_LOGOUT') {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'LOGOUT_BROADCAST'
        }).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      });
    });
  }

  // Handle join meeting requests
  if (request.type === 'JOIN_MEETING') {
    handleJoinMeeting(request.meeting);
    sendResponse({ success: true });
  }

  // Handle messages from content script
  if (request.type === 'MEET_ASSISTANT_READY') {
    const tabId = sender.tab.id;
    console.log(`Assistant ready for tab ${tabId} with meeting:`, request.meeting);
    
    // Store meeting data for this tab with enhanced transcript support
    activeMeetTabs.set(tabId, {
      meeting: request.meeting,
      assistantReady: true,
      transcript: [], // Store meeting transcript with speaker identification
      speakers: new Map(), // Track unique speakers
      audioCaptureEnabled: false,
      lastUpdated: Date.now()
    });
    
    console.log(`Stored meeting data for tab ${tabId}:`, activeMeetTabs.get(tabId));
    sendResponse({ success: true });
  }

  // Handle assistant requests from Meet content script
  if (request.type === 'ASSISTANT_REQUEST') {
    handleAssistantRequest(request, sender.tab.id, sendResponse);
    return true; // Keep the message channel open for async response
  }

  // Handle enhanced transcript updates from content script
  if (request.type === 'TRANSCRIPT_UPDATE') {
    const tabId = sender.tab.id;
    const tabData = activeMeetTabs.get(tabId);
    if (tabData) {
      // Process and enhance transcript data
      const enhancedTranscript = processTranscriptData(request.transcript || []);
      tabData.transcript = enhancedTranscript;
      tabData.lastUpdated = Date.now();
      
      // Update speaker tracking
      enhancedTranscript.forEach(entry => {
        if (entry.speaker && entry.speaker !== 'Unknown') {
          tabData.speakers.set(entry.speaker, {
            firstSeen: tabData.speakers.get(entry.speaker)?.firstSeen || entry.timestamp,
            lastSeen: entry.timestamp,
            entryCount: (tabData.speakers.get(entry.speaker)?.entryCount || 0) + 1
          });
        }
      });
      
      console.log(`Updated transcript for tab ${tabId}:`, tabData.transcript.length, 'entries,', tabData.speakers.size, 'speakers');
    }
    sendResponse({ success: true });
  }

  // Handle audio capture status updates
  if (request.type === 'AUDIO_CAPTURE_STATUS') {
    const tabId = sender.tab.id;
    const tabData = activeMeetTabs.get(tabId);
    if (tabData) {
      tabData.audioCaptureEnabled = request.enabled;
      console.log(`Audio capture ${request.enabled ? 'enabled' : 'disabled'} for tab ${tabId}`);
    }
    sendResponse({ success: true });
  }
});

// Process and enhance transcript data
function processTranscriptData(transcript) {
  return transcript.map(entry => {
    // Enhance entry with additional metadata
    return {
      ...entry,
      processed: true,
      wordCount: entry.text.split(' ').length,
      duration: estimateDuration(entry.text),
      confidence: entry.confidence || 0.8
    };
  });
}

// Estimate speaking duration based on word count
function estimateDuration(text) {
  const wordsPerMinute = 150; // Average speaking rate
  const wordCount = text.split(' ').length;
  return Math.round((wordCount / wordsPerMinute) * 60); // Duration in seconds
}

// Handle joining a meeting
async function handleJoinMeeting(meeting) {
  try {
    console.log('Joining meeting:', meeting);
    
    // Get the meeting link
    const meetUrl = meeting.link || meeting.hangoutLink;
    if (!meetUrl) {
      console.error('No meeting link found');
      return;
    }

    // Open the Meet tab
    const tab = await chrome.tabs.create({
      url: meetUrl,
      active: true
    });

    // Store meeting data for this tab with enhanced features
    activeMeetTabs.set(tab.id, {
      meeting: meeting,
      assistantReady: false,
      transcript: [],
      speakers: new Map(),
      audioCaptureEnabled: false,
      lastUpdated: Date.now()
    });

    console.log(`Opened Meet tab ${tab.id} for meeting: ${meeting.title}`);
    console.log(`Stored meeting data:`, activeMeetTabs.get(tab.id));
  } catch (error) {
    console.error('Error opening Meet tab:', error);
  }
}

// Handle assistant requests from Meet content script
async function handleAssistantRequest(request, tabId, sendResponse) {
  const startTime = performance.now();
  console.log(`Starting assistant request: ${request.data.type} at ${new Date().toISOString()}`);
  console.log(`Tab ID: ${tabId}, Active tabs:`, Array.from(activeMeetTabs.keys()));
  
  try {
    const tabData = activeMeetTabs.get(tabId);
    if (!tabData) {
      console.error('No meeting data found for tab:', tabId);
      console.log('Available tabs:', Array.from(activeMeetTabs.keys()));
      console.log('Tab data:', activeMeetTabs);
      sendResponse({ error: 'No meeting data found. Please join a meeting first.' });
      return;
    }

    const { type, data } = request.data;
    console.log(`Processing ${type} request with data:`, data);

    if (type === 'ASK_QUESTION') {
      console.log(`Sending question to Django backend: ${data.question}`);
      
      // Get current transcript for context with speaker information
      const transcript = tabData.transcript || [];
      const recentTranscript = transcript.slice(-10); // Last 10 entries
      
      // Format transcript with speaker information
      const formattedTranscript = recentTranscript.map(entry => 
        `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`
      ).join('\n');
      
      // Forward to Django backend
      const requestStart = performance.now();
      const response = await fetch('http://127.0.0.1:8000/chatbot/ask/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: data.question,
          meeting_id: tabData.meeting.id,
          folder: tabData.meeting.folder,
          transcript: formattedTranscript, // Send formatted transcript with speakers
          full_conversation: tabData.transcript, // Send complete conversation data
          meeting_title: tabData.meeting.title,
          speakers: Array.from(tabData.speakers.keys()), // Send speaker list
          audio_capture_enabled: tabData.audioCaptureEnabled,
          conversation_context: generateConversationContext(tabData.transcript)
        })
      });

      const requestTime = performance.now() - requestStart;
      console.log(`Django request took: ${requestTime.toFixed(2)}ms`);

      const result = await response.json();
      const totalTime = performance.now() - startTime;
      console.log(`Total ask question time: ${totalTime.toFixed(2)}ms`);

      // Send response back to content script
      chrome.tabs.sendMessage(tabId, {
        type: 'ASSISTANT_RESPONSE',
        data: result
      });

      // Also send response to the original request
      sendResponse({ data: result });
    }

    else if (type === 'SUMMARIZE') {
      console.log('Sending summarize request to Django backend');
      
      // Get full transcript for summarization with speaker analysis
      const transcript = tabData.transcript || [];
      const fullTranscript = transcript.map(entry => 
        `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`
      ).join('\n');
      
      // Analyze speaker participation
      const speakerAnalysis = analyzeSpeakerParticipation(tabData.speakers, transcript);
      
      // Forward to Django backend
      const requestStart = performance.now();
      const response = await fetch('http://127.0.0.1:8000/chatbot/summarize/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meeting_id: tabData.meeting.id,
          folder: tabData.meeting.folder,
          transcript: fullTranscript, // Send full transcript with speakers
          full_conversation: tabData.transcript, // Send complete conversation data
          meeting_title: tabData.meeting.title,
          meeting_duration: tabData.meeting.duration,
          speaker_analysis: speakerAnalysis, // Send speaker participation analysis
          audio_capture_enabled: tabData.audioCaptureEnabled,
          conversation_summary: generateConversationSummary(tabData.transcript),
          key_topics: extractKeyTopics(tabData.transcript)
        })
      });

      const requestTime = performance.now() - requestStart;
      console.log(`Django summarize request took: ${requestTime.toFixed(2)}ms`);

      const result = await response.json();
      const totalTime = performance.now() - startTime;
      console.log(`Total summarize time: ${totalTime.toFixed(2)}ms`);

      // Send response back to content script
      chrome.tabs.sendMessage(tabId, {
        type: 'SUMMARIZE_RESPONSE',
        data: result
      });

      // Also send response to the original request
      sendResponse({ data: result });
    }
  } catch (error) {
    console.error('Error handling assistant request:', error);
    const totalTime = performance.now() - startTime;
    console.log(`Error occurred after: ${totalTime.toFixed(2)}ms`);
    
    // Send error response to content script
    chrome.tabs.sendMessage(tabId, {
      type: 'ASSISTANT_ERROR',
      error: 'Failed to process request'
    });

    // Also send error to the original request
    sendResponse({ error: 'Failed to process request' });
  }
}

// Generate conversation context for better AI responses
function generateConversationContext(transcript) {
  if (!transcript || transcript.length === 0) {
    return "No conversation data available.";
  }

  const recentEntries = transcript.slice(-10); // Last 10 entries
  const context = {
    current_topic: extractCurrentTopic(recentEntries),
    recent_speakers: [...new Set(recentEntries.map(entry => entry.speaker))],
    conversation_flow: recentEntries.map(entry => ({
      speaker: entry.speaker,
      text: entry.text,
      timestamp: entry.timestamp
    })),
    total_entries: transcript.length
  };

  return context;
}

// Generate conversation summary
function generateConversationSummary(transcript) {
  if (!transcript || transcript.length === 0) {
    return "No conversation to summarize.";
  }

  const speakers = [...new Set(transcript.map(entry => entry.speaker))];
  const totalWords = transcript.reduce((sum, entry) => sum + entry.text.split(' ').length, 0);
  
  const summary = {
    total_speakers: speakers.length,
    total_entries: transcript.length,
    total_words: totalWords,
    estimated_duration: Math.round(totalWords / 150), // Assuming 150 words per minute
    main_speakers: speakers.slice(0, 5), // Top 5 speakers
    conversation_start: transcript[0]?.timestamp,
    conversation_end: transcript[transcript.length - 1]?.timestamp
  };

  return summary;
}

// Extract key topics from conversation
function extractKeyTopics(transcript) {
  if (!transcript || transcript.length === 0) {
    return [];
  }

  const allText = transcript.map(entry => entry.text).join(' ').toLowerCase();
  const words = allText.split(/\s+/);
  
  // Common words to ignore
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'yes', 'no', 'okay', 'ok', 'sure', 'well', 'so', 'now', 'then', 'here', 'there'
  ]);

  // Count word frequency
  const wordCount = {};
  words.forEach(word => {
    word = word.replace(/[^\w]/g, ''); // Remove punctuation
    if (word.length > 3 && !stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });

  // Get top topics
  const topics = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word, count]) => ({ topic: word, mentions: count }));

  return topics;
}

// Extract current topic from recent conversation
function extractCurrentTopic(recentEntries) {
  if (!recentEntries || recentEntries.length === 0) {
    return "No current topic";
  }

  const recentText = recentEntries.map(entry => entry.text).join(' ').toLowerCase();
  
  // Look for topic indicators
  const topicPatterns = [
    /talking about (.+?)[\.\,\?]/,
    /discussing (.+?)[\.\,\?]/,
    /regarding (.+?)[\.\,\?]/,
    /about (.+?)[\.\,\?]/
  ];

  for (const pattern of topicPatterns) {
    const match = recentText.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback: extract key words from recent entries
  const words = recentText.split(' ').filter(word => word.length > 4);
  return words.slice(0, 3).join(', ') || "General discussion";
}

// Analyze speaker participation in the meeting
function analyzeSpeakerParticipation(speakers, transcript) {
  const analysis = {
    totalSpeakers: speakers.size,
    speakerDetails: [],
    mostActiveSpeaker: null,
    totalEntries: transcript.length,
    conversationFlow: analyzeConversationFlow(transcript)
  };

  if (speakers.size === 0) {
    return analysis;
  }

  // Calculate participation for each speaker
  let maxEntries = 0;
  speakers.forEach((data, speaker) => {
    const speakerEntries = transcript.filter(entry => entry.speaker === speaker);
    const wordCount = speakerEntries.reduce((sum, entry) => sum + entry.text.split(' ').length, 0);
    
    const participation = {
      name: speaker,
      entryCount: data.entryCount,
      wordCount: wordCount,
      averageWordsPerEntry: Math.round(wordCount / data.entryCount),
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      participationPercentage: Math.round((data.entryCount / transcript.length) * 100)
    };

    analysis.speakerDetails.push(participation);

    if (data.entryCount > maxEntries) {
      maxEntries = data.entryCount;
      analysis.mostActiveSpeaker = speaker;
    }
  });

  // Sort by participation
  analysis.speakerDetails.sort((a, b) => b.entryCount - a.entryCount);

  return analysis;
}

// Analyze conversation flow patterns
function analyzeConversationFlow(transcript) {
  if (!transcript || transcript.length < 2) {
    return { patterns: [], interactions: 0 };
  }

  const interactions = [];
  for (let i = 1; i < transcript.length; i++) {
    const prev = transcript[i - 1];
    const curr = transcript[i];
    if (prev.speaker !== curr.speaker) {
      interactions.push({
        from: prev.speaker,
        to: curr.speaker,
        timestamp: curr.timestamp
      });
    }
  }

  // Count interaction patterns
  const patterns = {};
  interactions.forEach(interaction => {
    const key = `${interaction.from} → ${interaction.to}`;
    patterns[key] = (patterns[key] || 0) + 1;
  });

  return {
    patterns: Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count })),
    interactions: interactions.length
  };
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeMeetTabs.has(tabId)) {
    activeMeetTabs.delete(tabId);
    console.log(`Cleaned up meeting data for tab ${tabId}`);
  }
});

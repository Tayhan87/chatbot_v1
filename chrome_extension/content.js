chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FORCE_LOGOUT') {
    window.location.href = '/login/';
  }
}); 
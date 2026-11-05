const status = document.getElementById('status');
document.getElementById('record').addEventListener('click', async () => {
  // Explicit consent: allows annotation in whichever website tab user selects or switches to.
  const granted=await chrome.permissions.request({origins:['http://*/*','https://*/*']});
  if(!granted){status.textContent='Website access is required for automatic drawing on other tabs. Recording is still available; click again to continue without drawing permission.';}
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  const source = tab?.id && /^https?:/.test(tab.url || '') ? `?sourceTab=${tab.id}` : '';
  await chrome.tabs.create({url: chrome.runtime.getURL('recorder.html'+source)});
  window.close();
});
document.getElementById('annotate').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw Error('Open a regular http/https website first.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['annotation.js']});
    status.textContent='Drawing toolbar enabled on the current tab.';
  } catch(e) {status.textContent='Could not enable drawing: '+e.message;}
});

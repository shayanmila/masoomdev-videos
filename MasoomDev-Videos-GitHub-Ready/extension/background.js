// No remote requests. Session state is held only while the browser is running.
let recording=false;
const website=url=>/^https?:\/\//.test(url||'');
async function overlay(tabId){
  if(!recording || !tabId)return;
  try{
    const tab=await chrome.tabs.get(tabId);
    if(!website(tab.url))return;
    const allowed=await chrome.permissions.contains({origins:[new URL(tab.url).origin+'/*']});
    if(!allowed)return;
    // Do not reinject when already present, which would toggle an open toolbar.
    const [{result:present}]=await chrome.scripting.executeScript({target:{tabId},func:()=>!!document.getElementById('masoomdev-annotation-root')});
    if(!present)await chrome.scripting.executeScript({target:{tabId},files:['annotation.js']});
    await chrome.scripting.executeScript({target:{tabId},func:()=>document.getElementById('masoomdev-annotation-root')?.dispatchEvent(new CustomEvent('masoomdev:recording',{detail:{active:true}}))});
  }catch(e){console.debug('Overlay unavailable',e.message)}
}
async function broadcast(active){
  recording=active;
  const tabs=await chrome.tabs.query({});
  if(active){
    // Only current active tabs in each window; other tabs get overlay on activation.
    for(const tab of tabs.filter(t=>t.active))await overlay(tab.id);
  }else{
    for(const tab of tabs){
      if(!website(tab.url))continue;
      try{await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.getElementById('masoomdev-annotation-root')?.dispatchEvent(new CustomEvent('masoomdev:recording',{detail:{active:false}}))});}catch{}
    }
  }
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type==='masoomdev-recording-state'){
    broadcast(!!msg.active).then(()=>sendResponse({ok:true})).catch(e=>sendResponse({error:e.message}));return true;
  }
  // Stop request forwarded to the recorder tab; recorder validates its own state.
  if(msg?.type==='masoomdev-stop-recording'&&!msg.forwarded){
    chrome.runtime.sendMessage({type:'masoomdev-stop-recording',forwarded:true}).catch(()=>{});
  }
});
chrome.tabs.onActivated.addListener(({tabId})=>overlay(tabId));
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{if(change.status==='complete'&&tab.active)overlay(tabId)});

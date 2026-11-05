'use strict';
const $=id=>document.getElementById(id);
const CLIENT_ID='514611970632-1rdt4kgifqfq7nl5r9s06aup2edtqc0m.apps.googleusercontent.com';
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
let accessToken=null;
const params=new URLSearchParams(location.search);
const viewId=params.get('v');
if(viewId){
  $('dashboard').hidden=true;$('viewer').hidden=false;
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(viewId)){
    $('cacheStatus').textContent='Invalid video link';$('openDrive').hidden=true;
  }else{
    const token=params.get('t');
    const iframe=document.createElement('iframe');
    iframe.src='https://drive.google.com/file/d/'+encodeURIComponent(viewId)+'/preview';
    iframe.title='Google Drive fallback preview';iframe.allow='autoplay; fullscreen';iframe.referrerPolicy='no-referrer';
    $('frame').append(iframe);
    if(token && /^[A-Za-z0-9_-]{20,256}$/.test(token))loadCachedVideo(viewId,token);
    else{$('cacheStatus').textContent='Legacy Drive link: secure caching requires a Phase 2 share link.';$('driveFallback').hidden=false;}
    $('openDrive').href='https://drive.google.com/file/d/'+encodeURIComponent(viewId)+'/view';
  }
}else{
  $('connect').onclick=()=>location.assign('/api/auth/start');
  $('disconnect').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.reload()};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('shareUrl').value);status('Link copied.')}catch{status('Select and copy the link manually.')}};
  $('upload').onclick=upload;
  fetch('/api/me').then(r=>r.json()).then(async d=>{
    if(!d.connected)return;
    $('account').textContent='Connected as '+d.email;
    $('connect').hidden=true;$('disconnect').hidden=false;$('upload').disabled=false;
    const token=await fetch('/api/upload-token').then(r=>r.json());
    if(token.access_token)accessToken=token.access_token;
    else status('Could not authorize Google Drive upload. Reconnect your account.');
  }).catch(()=>status('Backend connection failed. Start the Node.js server.'));
}
function status(message){$('status').textContent=message;}
async function api(path,opts={}){
  const res=await fetch(API+path,{...opts,headers:{Authorization:'Bearer '+accessToken,...opts.headers}});
  if(!res.ok)throw Error('Google Drive API: '+res.status+' '+(await res.text()).slice(0,250));
  return res.status===204?{}:res.json();
}
function resumablePut(url,file){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
    xhr.upload.onprogress=e=>{if(e.lengthComputable){$('progress').value=Math.round(e.loaded/e.total*100);status('Uploading '+$('progress').value+'%');}};
    xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){try{resolve(JSON.parse(xhr.responseText))}catch(e){reject(e)}}else reject(Error('Upload failed: HTTP '+xhr.status+' '+xhr.responseText.slice(0,200)))};
    xhr.onerror=()=>reject(Error('Network error during upload'));xhr.send(file);
  });
}
async function upload(){
  const file=$('video').files[0];if(!file)return status('Choose a video file.');
  if(file.size>100*1024*1024)return status('Maximum upload size is 100 MiB.');
  if(!['video/mp4','video/webm','video/quicktime'].includes(file.type))return status('Choose MP4, WebM or MOV video.');
  if(!accessToken)return status('Connect Google Drive first.');
  $('upload').disabled=true;$('progress').hidden=false;$('progress').value=0;$('result').hidden=true;
  try{
    const name=($('title').value.trim()||file.name).slice(0,160);
    const session=await fetch(UPLOAD+'?uploadType=resumable&fields=id,name,webViewLink',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':file.type,'X-Upload-Content-Length':String(file.size)},
      body:JSON.stringify({name,mimeType:file.type,description:'Uploaded with MasoomDev Videos'})
    });
    if(!session.ok)throw Error('Could not start upload: '+session.status+' '+(await session.text()).slice(0,200));
    const url=session.headers.get('Location');if(!url)throw Error('Google did not return an upload session URL.');
    const saved=await resumablePut(url,file);if(!saved.id)throw Error('Upload response missing file ID.');
    if($('share').checked){
      status('Upload complete. Enabling anyone-with-link viewing...');
      try{await api('/files/'+encodeURIComponent(saved.id)+'/permissions?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'anyone',role:'reader',allowFileDiscovery:false})});}
      catch(err){status('Uploaded privately, but link sharing failed: '+err.message+'. Check sharing policy in Google Drive.');return;}
      const shareResponse=await fetch('/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileId:saved.id})});
      const shareData=await shareResponse.json();
      if(!shareResponse.ok)throw Error('Video uploaded, but secure sharing failed: '+(shareData.error||shareResponse.status));
      $('shareUrl').value=shareData.url;$('result').hidden=false;status('Uploaded to your Drive. Secure unlisted link ready.');
    }else status('Uploaded privately to your Drive. Enable link sharing and upload another video to generate a viewer link.');
  }catch(err){status(err.message)}finally{$('upload').disabled=!accessToken;}
}

// Screen Recorder bridge: only a user-opened page with an actual extension opener can request a file.
// Chrome extension origin cannot be forged by a normal website. Never auto-upload without user action.
if(!viewId && new URLSearchParams(location.search).get('from')==='recorder'){
  const bridgeStatus=message=>status(message);
  window.addEventListener('message',event=>{
    if(event.source!==window.opener || !/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin))return;
    const payload=event.data;
    if(payload?.type!=='masoomdev-video-transfer'||payload.version!==1)return;
    const blob=payload.blob;
    const normalizedType=blob instanceof Blob ? String(blob.type||'').split(';',1)[0].trim().toLowerCase() : '';
    if(!(blob instanceof Blob)||!blob.size||blob.size>100*1024*1024||!['video/webm','video/mp4','video/quicktime'].includes(normalizedType)){
      bridgeStatus('Recording transfer rejected: invalid format or over 100 MiB.');return;
    }
    const safeName=String(payload.fileName||'MasoomDev-Recording.webm').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,150);
    const file=new File([blob],safeName,{type:normalizedType});
    const dt=new DataTransfer();dt.items.add(file);$('video').files=dt.files;
    $('title').value=safeName.replace(/\.[^.]+$/,'');
    $('share').checked=true;
    bridgeStatus('Recording received from Screen Recorder ('+(file.size/1048576).toFixed(1)+' MiB). Click Upload to my Drive to confirm.');
    window.__masoomdevTransferReceived=true;
    $('video').scrollIntoView({behavior:'smooth',block:'center'});
  });
  if(window.opener){
    // Wait for the recorder tab to receive the handshake; repeat briefly if it is still initializing.
    let attempts=0;const timer=setInterval(()=>{
      if(window.__masoomdevTransferReceived||window.opener?.closed||++attempts>12){clearInterval(timer);return;}
      window.opener.postMessage({type:'masoomdev-video-ready'},'*');
    },400);
  }else bridgeStatus('Recorder transfer not available. Open this page using Upload to MasoomDev Videos in the recorder tab.');
}

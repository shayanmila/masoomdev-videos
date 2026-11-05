'use strict';
const $ = id => document.getElementById(id);
let recorder, capture, micStream, audioContext, mixed, chunks=[], startedAt=0, elapsed=0, interval, currentBlob, previewURL;
let annotationActive=false;
let renderVideo=null, renderCanvas=null, renderFrame=0, renderedStream=null;
async function annotationSignal(event,detail={}){
  try{
    if(event==='recording'){
      await chrome.runtime.sendMessage({type:'masoomdev-recording-state',active:!!detail.active});
      annotationActive=!!detail.active;
    }else if(event==='time' && annotationActive){
      const tabs=await chrome.tabs.query({active:true});
      for(const tab of tabs){
        if(!/^https?:/.test(tab.url||''))continue;
        try{await chrome.scripting.executeScript({target:{tabId:tab.id},func:data=>document.getElementById('masoomdev-annotation-root')?.dispatchEvent(new CustomEvent('masoomdev:time',{detail:data})),args:[detail]});}catch{}
      }
    }
  }catch(e){console.warn('Overlay control:',e)}
}
// Extension-page message listener: messages from content overlays arrive through the background.
chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==='masoomdev-stop-recording'&&recorder&&recorder.state!=='inactive')$('stop').click();
});
const mp4Type=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E"','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
if(!mp4Type){$('format').querySelectorAll('option:not([value="webm"])').forEach(o=>o.disabled=true);$('format').title='MP4 encoding unavailable in this Chrome build';}
function notify(msg){$('message').textContent=msg;}
function clock(){const s=Math.floor(elapsed/1000);$('timer').textContent=[Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');if(annotationActive)annotationSignal('time',{time:$('timer').textContent});}
function tick(){if(startedAt) elapsed += Date.now()-startedAt,startedAt=Date.now();clock();}
function controls(state){$('start').disabled=state!=='idle';$('stop').disabled=state==='idle';$('pause').disabled=state!=='recording';$('resume').disabled=state!=='paused';}
async function cleanup(){if(renderFrame)cancelAnimationFrame(renderFrame);renderFrame=0;if(renderVideo){renderVideo.pause();renderVideo.srcObject=null;renderVideo=null;}renderedStream?.getTracks().forEach(t=>t.stop());renderedStream=null;renderCanvas=null;clearInterval(interval);startedAt=0;capture?.getTracks().forEach(t=>t.stop());micStream?.getTracks().forEach(t=>t.stop());mixed?.getTracks().forEach(t=>t.stop());if(audioContext){await audioContext.close().catch(()=>{});audioContext=null;}}
$('start').addEventListener('click',async()=>{
  if(recorder?.state && recorder.state!=='inactive')return;
  chunks=[];elapsed=0;clock();$('result').hidden=true;notify('Choose the source in Chrome’s share dialog…');
  try{
    capture=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:$('systemAudio').checked});
    const videoTracks=capture.getVideoTracks();if(!videoTracks.length)throw Error('No video track was selected');
    const audioStreams=[];
    if(capture.getAudioTracks().length)audioStreams.push(capture);
    if($('mic').checked){try{micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});audioStreams.push(micStream);}catch(e){notify('Microphone unavailable; recording without microphone: '+e.message);}}
    // Render the selected capture to a fixed 16:9 canvas. Center crop fills the frame.
    const [outputWidth,outputHeight]=$('resolution').value.split('x').map(Number);
    renderVideo=document.createElement('video');renderVideo.srcObject=new MediaStream(videoTracks);
    renderVideo.muted=true;renderVideo.playsInline=true;
    await new Promise((resolve,reject)=>{renderVideo.onloadedmetadata=resolve;renderVideo.onerror=()=>reject(Error('Cannot preview capture source'));});
    await renderVideo.play();
    renderCanvas=document.createElement('canvas');renderCanvas.width=outputWidth;renderCanvas.height=outputHeight;
    const ctx=renderCanvas.getContext('2d',{alpha:false});
    if(!ctx)throw Error('Canvas rendering unavailable');
    const draw=()=>{
      if(!renderCanvas||!renderVideo)return;
      const sw=renderVideo.videoWidth,sh=renderVideo.videoHeight;
      if(sw&&sh){const targetRatio=outputWidth/outputHeight,sourceRatio=sw/sh;
        let sx=0,sy=0,cw=sw,ch=sh;
        if(sourceRatio>targetRatio){cw=sh*targetRatio;sx=(sw-cw)/2;}
        else {ch=sw/targetRatio;sy=(sh-ch)/2;}
        ctx.drawImage(renderVideo,sx,sy,cw,ch,0,0,outputWidth,outputHeight);
      }
      renderFrame=requestAnimationFrame(draw);
    };
    draw();
    renderedStream=renderCanvas.captureStream(30);
    let tracks=[...renderedStream.getVideoTracks()];
    if(audioStreams.length){
      audioContext=new AudioContext();const dest=audioContext.createMediaStreamDestination();
      for(const source of audioStreams){const audioOnly=new MediaStream(source.getAudioTracks());audioContext.createMediaStreamSource(audioOnly).connect(dest);}
      tracks.push(...dest.stream.getAudioTracks());
    }
    mixed=new MediaStream(tracks);
    const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!type)throw Error('WebM MediaRecorder is not supported by this browser');
    const bitrate=$('quality').value==='good'?1000000:512000;
    recorder=new MediaRecorder(mixed,{mimeType:type,videoBitsPerSecond:bitrate});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>notify('Recording error: '+(e.error?.message||'unknown'));
    recorder.onstop=async()=>{
      currentBlob=new Blob(chunks,{type:recorder.mimeType});chunks=[];
      if(previewURL)URL.revokeObjectURL(previewURL);
      previewURL=URL.createObjectURL(currentBlob);$('preview').src=previewURL;$('result').hidden=false;
      $('quality').disabled=false;$('resolution').disabled=false;controls('idle');await annotationSignal('recording',{active:false});await cleanup();notify('Recording finished. Preview and choose a local export format.');
    };
    videoTracks[0].addEventListener('ended',()=>{if(recorder?.state!=='inactive')recorder.stop();},{once:true});
    $('quality').disabled=true;$('resolution').disabled=true;recorder.start(1000);startedAt=Date.now();interval=setInterval(tick,1000);controls('recording');notify('Recording in progress. Keep this tab open.');await annotationSignal('recording',{active:true});
  }catch(e){$('quality').disabled=false;$('resolution').disabled=false;await cleanup();controls('idle');notify('Unable to start: '+e.message);}
});
$('pause').addEventListener('click',()=>{if(recorder?.state==='recording'){tick();recorder.pause();startedAt=0;controls('paused');notify('Recording paused.');}});
$('resume').addEventListener('click',()=>{if(recorder?.state==='paused'){recorder.resume();startedAt=Date.now();controls('recording');notify('Recording resumed.');}});
$('stop').addEventListener('click',()=>{if(recorder && recorder.state!=='inactive'){tick();recorder.stop();controls('idle');}});
function download(blob,ext){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MasoomDev-Recording-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function convertToMP4(blob){
  if(!mp4Type)throw Error('This browser does not support native MP4 encoding.');
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';const url=URL.createObjectURL(blob);video.src=url;
  try{
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Cannot decode original WebM'));});
    // Browser-native real-time re-encoding. The video element captureStream API is not supported in all browsers.
    if(typeof video.captureStream!=='function')throw Error('Local MP4 conversion is unavailable in this browser.');
    const stream=video.captureStream();
    const output=[];const mr=new MediaRecorder(stream,{mimeType:mp4Type,videoBitsPerSecond:3500000});
    const completed=new Promise((resolve,reject)=>{mr.ondataavailable=e=>{if(e.data.size)output.push(e.data)};mr.onerror=e=>reject(e.error||Error('Encoding failed'));mr.onstop=()=>resolve();});
    await video.play();
    // Wait for captureStream to expose the decoded tracks before starting the encoder.
    await new Promise(resolve=>setTimeout(resolve,250));
    if(!stream.getVideoTracks().length)throw Error('Browser cannot capture decoded video for conversion');
    mr.start(1000);
    await new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=()=>reject(Error('Playback failed during conversion'));});
    if(mr.state!=='inactive')mr.stop();await completed;
    const mp4=new Blob(output,{type:mr.mimeType});if(!mp4.size)throw Error('MP4 conversion returned an empty file');return mp4;
  }finally{video.pause();URL.revokeObjectURL(url);}
}
$('save').addEventListener('click',async()=>{
  if(!currentBlob)return;const format=$('format').value;$('save').disabled=true;
  try{
    if(format==='webm'||format==='both')download(currentBlob,'webm');
    if(format==='mp4'||format==='both'){$('progress').textContent='Converting locally in real time…';const mp4=await convertToMP4(currentBlob);download(mp4,'mp4');}
    $('progress').textContent='Download initiated.';
  }catch(e){$('progress').textContent='Export failed: '+e.message;}
  finally{$('save').disabled=false;}
});
window.addEventListener('beforeunload',()=>{if(recorder?.state==='recording'||recorder?.state==='paused'){capture?.getTracks().forEach(t=>t.stop());}});

// User-initiated transfer of the finished recording to the website.
// Uses window.postMessage structured cloning; never exposes Google OAuth tokens to the extension.
let transferWindow=null, transferOrigin=null;
$('sendToVideos').addEventListener('click',()=>{
  if(!currentBlob || !currentBlob.size)return notify('Finish a recording first.');
  if(currentBlob.size>100*1024*1024)return notify('This recording exceeds the website 100 MiB upload limit. Save locally instead.');
  const configured=localStorage.getItem('masoomdev-videos-url')||'https://videos.masoomdev.online';
  let target;
  try{
    target=new URL(configured);
    if(target.username||target.password||target.search||target.hash||target.pathname!=='/'||!(target.protocol==='https:' || (target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname))))throw Error('Invalid website URL');
  }catch{return notify('Invalid MasoomDev Videos website URL.');}
  transferOrigin=target.origin;
  transferWindow=window.open(target.origin+'/?from=recorder','_blank');
  if(!transferWindow)return notify('Allow popups for this extension to transfer the recording.');
  notify('MasoomDev Videos opened. Wait for the transfer confirmation in that tab.');
});
window.addEventListener('message',event=>{
  if(!transferWindow||event.source!==transferWindow||event.origin!==transferOrigin)return;
  if(event.data?.type!=='masoomdev-video-ready'||!currentBlob)return;
  try{
    transferWindow.postMessage({type:'masoomdev-video-transfer',version:1,
      fileName:'MasoomDev-Recording-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm',
      blob:new Blob([currentBlob],{type:currentBlob.type.split(';',1)[0].toLowerCase()})},transferOrigin);
    notify('Recording sent to MasoomDev Videos. Confirm the upload in the website tab.');
    transferWindow=null; transferOrigin=null;
  }catch(e){notify('Transfer failed: '+e.message);}
});

const videosUrlInput=$('videosUrl');
videosUrlInput.value=localStorage.getItem('masoomdev-videos-url')||'https://videos.masoomdev.online';
videosUrlInput.addEventListener('change',()=>{
  const value=videosUrlInput.value.trim().replace(/\/$/,'');
  try{const u=new URL(value);if(u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('URL must be HTTPS or localhost');localStorage.setItem('masoomdev-videos-url',u.origin);notify('Videos website URL saved.');}
  catch(e){notify('Website URL not saved: '+e.message)}
});

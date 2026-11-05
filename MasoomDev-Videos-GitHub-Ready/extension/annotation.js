(()=>{
'use strict';
const existing=document.getElementById('masoomdev-annotation-root');
if(existing){
  if(existing.dataset.recording==='true')existing.dispatchEvent(new CustomEvent('masoomdev:toggle'));
  else existing.remove();
  return;
}
const host=document.createElement('div');host.id='masoomdev-annotation-root';host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;';document.documentElement.appendChild(host);
host.dataset.recording='false';
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>
*{box-sizing:border-box}canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none}#bar{position:fixed;top:18px;right:18px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px;box-shadow:0 8px 30px #0003;display:flex;align-items:center;gap:5px;font:13px system-ui;pointer-events:auto;user-select:none}button{border:1px solid #ddd;background:white;border-radius:7px;padding:7px 9px;cursor:pointer;color:#252238;font:inherit}button.active{background:#7544e6;color:white}#drag{cursor:move;color:#777;padding:5px}input[type=color]{width:28px;height:29px;padding:0;border:0;background:none}input[type=range]{width:60px}#mini{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#241a39;color:white;border-radius:13px;padding:7px 9px;display:none;align-items:center;gap:8px;box-shadow:0 7px 28px #0005;pointer-events:auto;font:12px system-ui;white-space:nowrap}#mini button{background:#49365e;border:1px solid #6f5b88;color:white}#mini .dot{color:#ff606b}#hint{position:fixed;bottom:12px;left:12px;background:#241a39d9;color:#fff;border-radius:8px;padding:6px 10px;font:12px system-ui;pointer-events:none}</style><canvas id="canvas"></canvas><div id="bar" role="toolbar" aria-label="MasoomDev drawing tools"><span id="drag" title="Drag toolbar">⠿</span><button data-tool="pointer" class="active" title="Interact with page">↖</button><button data-tool="pencil" title="Pencil">✎</button><button data-tool="marker" title="Highlighter">▰</button><button data-tool="eraser" title="Eraser">⌫</button><input type="color" id="color" value="#ef4444" aria-label="Drawing color"><input type="range" id="size" min="2" max="24" value="5" aria-label="Brush size"><button id="undo" title="Undo">↶</button><button id="redo" title="Redo">↷</button><button id="clear" title="Clear drawings">Clear</button><button id="close" title="Close drawing toolbar">×</button></div><div id="mini"><span class="dot">● REC</span><span id="recclock">00:00</span><button id="drawtoggle">✎ Drawing</button><button id="recstop">■ Stop</button></div><div id="hint">Pointer mode • select pencil to draw</div>`;
const canvas=root.getElementById('canvas'),ctx=canvas.getContext('2d'),bar=root.getElementById('bar'),hint=root.getElementById('hint');
let toolbarVisible=true,recording=false,mode='pointer',color='#ef4444',size=5,strokes=[],redo=[],current=null,drag=null;
function resize(){const ratio=devicePixelRatio||1;canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);render();}
function line(s){if(!s.points.length)return;ctx.globalAlpha=s.tool==='marker'?.3:1;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=s.color;ctx.lineWidth=s.tool==='marker'?s.size*5:s.size;ctx.beginPath();ctx.moveTo(s.points[0].x*innerWidth,s.points[0].y*innerHeight);if(s.points.length===1){ctx.lineTo(s.points[0].x*innerWidth+.01,s.points[0].y*innerHeight+.01);}for(let i=1;i<s.points.length;i++)ctx.lineTo(s.points[i].x*innerWidth,s.points[i].y*innerHeight);ctx.stroke();ctx.globalAlpha=1;}
function render(){ctx.clearRect(0,0,innerWidth,innerHeight);strokes.forEach(line);if(current)line(current);}
function setMode(next){mode=next;canvas.style.pointerEvents=mode==='pointer'?'none':'auto';root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===mode));hint.textContent=mode==='pointer'?'Pointer mode • click website normally':mode==='eraser'?'Eraser • click a drawing to remove it':mode==='marker'?'Highlighter • drag to mark':'Pencil • drag to draw';}
root.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.tool)));
root.getElementById('color').addEventListener('input',e=>color=e.target.value);root.getElementById('size').addEventListener('input',e=>size=+e.target.value);
root.getElementById('undo').addEventListener('click',()=>{if(strokes.length){redo.push(strokes.pop());render();}});
root.getElementById('redo').addEventListener('click',()=>{if(redo.length){strokes.push(redo.pop());render();}});
root.getElementById('clear').addEventListener('click',()=>{if(strokes.length){redo=[];strokes=[];render();}});
function toggleBar(show){
  toolbarVisible=show;bar.style.display=show?'flex':'none';hint.style.display=show?'block':'none';
  if(!show)setMode('pointer');
  root.getElementById('drawtoggle').textContent=show?'✎ Hide drawing':'✎ Drawing';
}
root.getElementById('close').addEventListener('click',()=>{
  if(recording)toggleBar(false);
  else{removeEventListener('resize',resize);host.remove();}
});
root.getElementById('drawtoggle').addEventListener('click',()=>toggleBar(!toolbarVisible));
root.getElementById('recstop').addEventListener('click',()=>chrome.runtime.sendMessage({type:'masoomdev-stop-recording'}).catch(()=>{}));
host.addEventListener('masoomdev:toggle',()=>toggleBar(!toolbarVisible));
host.addEventListener('masoomdev:recording',e=>{
  recording=!!e.detail?.active;host.dataset.recording=String(recording);
  root.getElementById('mini').style.display=recording?'flex':'none';
  if(recording)toggleBar(true);else toggleBar(false);
});
host.addEventListener('masoomdev:time',e=>{root.getElementById('recclock').textContent=e.detail?.time||'00:00';});
const point=e=>({x:e.clientX/innerWidth,y:e.clientY/innerHeight});
function near(s,p){return s.points.some(q=>Math.hypot((q.x-p.x)*innerWidth,(q.y-p.y)*innerHeight)<Math.max(16,s.size*4));}
canvas.addEventListener('pointerdown',e=>{if(mode==='pointer')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=point(e);if(mode==='eraser'){const idx=strokes.findLastIndex(s=>near(s,p));if(idx>=0){strokes.splice(idx,1);redo=[];render();}return;}current={tool:mode,color,size,points:[p]};render();});
canvas.addEventListener('pointermove',e=>{if(current){current.points.push(point(e));render();}});
function finish(){if(current){strokes.push(current);current=null;redo=[];render();}}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
const handle=root.getElementById('drag');handle.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,left:bar.getBoundingClientRect().left,top:bar.getBoundingClientRect().top};handle.setPointerCapture(e.pointerId);e.preventDefault();});
handle.addEventListener('pointermove',e=>{if(!drag)return;bar.style.left=Math.max(0,Math.min(innerWidth-bar.offsetWidth,drag.left+e.clientX-drag.x))+'px';bar.style.top=Math.max(0,Math.min(innerHeight-bar.offsetHeight,drag.top+e.clientY-drag.y))+'px';bar.style.right='auto';});handle.addEventListener('pointerup',()=>drag=null);
addEventListener('resize',resize);resize();
})();

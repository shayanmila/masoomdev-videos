// MasoomDev Videos Cloudflare Workers production candidate — no server-side video storage.
const LIMIT=100*1024*1024;
const te=new TextEncoder(), td=new TextDecoder();
const rand=(n=32)=>{const b=crypto.getRandomValues(new Uint8Array(n));return b64(b)};
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s))));
const key=async env=>crypto.subtle.importKey('raw',Uint8Array.from(env.ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
async function encrypt(env,s){const iv=crypto.getRandomValues(new Uint8Array(12));const c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),te.encode(s)));return b64(iv)+'.'+b64(c)}
async function decrypt(env,s){const [i,c]=s.split('.');return td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(i)},await key(env),un64(c)))}
const j=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const err=(message,status=400)=>j({error:message},status);
const vid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(id);
const mime=m=>['video/mp4','video/webm','video/quicktime','video/ogg'].includes(m);
const cookie=r=>Object.fromEntries((r.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const base=env=>env.APP_ORIGIN.replace(/\/$/,'');
async function sess(req,env){const sid=cookie(req).mdsid;if(!sid||sid.length>100)return null;const s=await env.DB.prepare('SELECT user_id FROM sessions WHERE id_hash=? AND expires>?').bind(await sha(sid),Date.now()).first();return s?.user_id||null}
async function google(env,body){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});const t=await r.json();if(!r.ok)throw Error('Google OAuth token exchange failed');return t}
async function access(env,id){const u=await env.DB.prepare('SELECT refresh_enc,access_enc,expires FROM users WHERE id=?').bind(id).first();if(!u?.refresh_enc)throw Error('Google account is disconnected');if(u.access_enc&&u.expires>Date.now()+90000)return decrypt(env,u.access_enc);const t=await google(env,{client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:await decrypt(env,u.refresh_enc),grant_type:'refresh_token'});await env.DB.prepare('UPDATE users SET access_enc=?,expires=? WHERE id=?').bind(await encrypt(env,t.access_token),Date.now()+(t.expires_in||3600)*1000,id).run();return t.access_token}
async function metadata(id,token){const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,size,mimeType,owners(emailAddress),trashed',{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error('Drive metadata unavailable');return r.json()}
async function readJson(req){if(Number(req.headers.get('content-length')||0)>4096)throw Error('Request too large');const raw=await req.text();if(raw.length>4096)throw Error('Request too large');return JSON.parse(raw)}
function secureHeaders(response){const h=new Headers(response.headers);h.set('referrer-policy','no-referrer');h.set('x-content-type-options','nosniff');h.set('x-frame-options','DENY');h.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers:h})}
async function route(req,env){const url=new URL(req.url),p=url.pathname,origin=base(env);
 if(!env.DB||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.ENCRYPTION_KEY||!(/^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY))||!env.APP_ORIGIN)return err('Server configuration incomplete',503);
 if(req.method==='GET'&&p.startsWith('/api/')){const ip=req.headers.get('cf-connecting-ip')||'unknown';const bucket=Math.floor(Date.now()/60000);const k=await sha(ip+':'+p+':'+bucket);const r=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(k,(bucket+2)*60000).first();if(r?.count> (p.includes('/content')?20:90))return err('Rate limit reached',429);}
 if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.get('origin')!==origin)return err('Invalid origin',403);
 if(p==='/api/auth/start'&&req.method==='GET'){
  const state=rand(),verifier=rand(48),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(verifier))));
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,verifier,expires) VALUES(?,?,?)').bind(await sha(state),verifier,Date.now()+600000).run();
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:origin+'/api/auth/callback',response_type:'code',scope:'openid email profile https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'}))u.searchParams.set(k,v);
  return Response.redirect(u.toString(),302);
 }
 if(p==='/api/auth/callback'&&req.method==='GET'){
  const state=url.searchParams.get('state')||'',code=url.searchParams.get('code');if(!state||!code)return err('Missing OAuth response');const hash=await sha(state);
  const st=await env.DB.prepare('SELECT verifier,expires FROM oauth_states WHERE state_hash=?').bind(hash).first();if(!st||st.expires<Date.now())return err('OAuth state expired');
  await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=?').bind(hash).run();
  const t=await google(env,{client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,code,code_verifier:st.verifier,redirect_uri:origin+'/api/auth/callback',grant_type:'authorization_code'});
  const ir=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+t.access_token}});if(!ir.ok)return err('Identity verification failed',502);const identity=await ir.json();if(!identity.sub||!identity.email_verified)return err('Unverified Google identity',403);
  const old=await env.DB.prepare('SELECT refresh_enc FROM users WHERE id=?').bind(identity.sub).first();const refresh=t.refresh_token?await encrypt(env,t.refresh_token):old?.refresh_enc;if(!refresh)return err('Google did not grant offline access; reconnect with consent',403);
  await env.DB.prepare('INSERT INTO users(id,email,refresh_enc,access_enc,expires) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,refresh_enc=excluded.refresh_enc,access_enc=excluded.access_enc,expires=excluded.expires').bind(identity.sub,identity.email,refresh,await encrypt(env,t.access_token),Date.now()+(t.expires_in||3600)*1000).run();
  const sid=rand();await env.DB.prepare('INSERT INTO sessions(id_hash,user_id,expires) VALUES(?,?,?)').bind(await sha(sid),identity.sub,Date.now()+7*86400000).run();
  return new Response(null,{status:302,headers:{location:'/', 'set-cookie':`mdsid=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`}});
 }
 if(p==='/api/me'&&req.method==='GET'){const id=await sess(req,env);if(!id)return j({connected:false});const u=await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(id).first();return j({connected:true,email:u?.email})}
 if(p==='/api/logout'&&req.method==='POST'){const sid=cookie(req).mdsid;if(sid)await env.DB.prepare('DELETE FROM sessions WHERE id_hash=?').bind(await sha(sid)).run();return new Response(null,{status:204,headers:{'set-cookie':'mdsid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}})}
 if(p==='/api/upload-token'&&req.method==='GET'){const id=await sess(req,env);if(!id)return err('Sign in required',401);return j({access_token:await access(env,id)})}
 if(p==='/api/shares'&&req.method==='POST'){
  const id=await sess(req,env);if(!id)return err('Sign in required',401);const input=await readJson(req);if(!vid(input.fileId))return err('Invalid file ID');
  const user=await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(id).first(),token=await access(env,id),m=await metadata(input.fileId,token);
  if(m.trashed||!mime(m.mimeType)||!Number.isSafeInteger(Number(m.size))||Number(m.size)<1||Number(m.size)>LIMIT)return err('Only videos up to 100 MiB may be shared');
  if(!m.owners?.some(o=>o.emailAddress?.toLowerCase()===user.email.toLowerCase()))return err('Only owner may share',403);
  const st=rand();await env.DB.prepare('INSERT INTO shares(token_hash,file_id,owner_id,mime,size,created,revoked) VALUES(?,?,?,?,?,?,0)').bind(await sha(st),input.fileId,id,m.mimeType,Number(m.size),Date.now()).run();
  return j({url:`${origin}/?v=${encodeURIComponent(input.fileId)}&t=${st}`,token:st},201);
 }
 if(p==='/api/shares/revoke'&&req.method==='POST'){const id=await sess(req,env);if(!id)return err('Sign in required',401);const body=await readJson(req);if(typeof body.token!=='string')return err('Invalid token');const result=await env.DB.prepare('UPDATE shares SET revoked=1 WHERE token_hash=? AND owner_id=?').bind(await sha(body.token),id).run();return result.meta.changes?j({revoked:true}):err('Share not found',404)}
 const match=p.match(/^\/api\/videos\/([\w-]{10,200})\/content$/);
 if(match&&(req.method==='GET'||req.method==='HEAD')){
  const token=url.searchParams.get('token')||'';if(token.length<32||token.length>256)return err('Video unavailable',404);
  const share=await env.DB.prepare('SELECT file_id,owner_id,mime,size,revoked FROM shares WHERE token_hash=?').bind(await sha(token)).first();if(!share||share.revoked||share.file_id!==match[1])return err('Video unavailable',404);
  const a=await access(env,share.owner_id),m=await metadata(share.file_id,a);
  if(m.trashed||!mime(m.mimeType)||Number(m.size)!==share.size||m.mimeType!==share.mime||share.size>LIMIT)return err('Video changed or deleted',410);
  const perms=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(share.file_id)+'/permissions?fields=permissions(type,role)',{headers:{authorization:'Bearer '+a}});
  if(!perms.ok)return err('Sharing verification unavailable',503);const pd=await perms.json();if(!pd.permissions?.some(x=>x.type==='anyone'&&x.role==='reader'))return err('Public link access disabled by owner',403);
  if(req.method==='HEAD')return new Response(null,{headers:{'content-type':share.mime,'content-length':String(share.size)}});
  const upstream=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(share.file_id)+'?alt=media',{headers:{authorization:'Bearer '+a}});
  if(!upstream.ok)return err('Google Drive download unavailable',502);
  return new Response(upstream.body,{status:200,headers:{'content-type':share.mime,'content-length':String(share.size),'content-disposition':'inline','cache-control':'no-store'}});
 }
 if(p.startsWith('/api/'))return err('Unknown endpoint',404);
 // Static assets are bundled by Wrangler. Preserve the existing frontend without modification.
 const staticResponse=await env.ASSETS.fetch(req);const headers=new Headers(staticResponse.headers);headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-src https://drive.google.com; connect-src 'self' https://www.googleapis.com https://www.googleapis.com/upload/drive/v3/files https://*.googleusercontent.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");return new Response(staticResponse.body,{status:staticResponse.status,headers});
}
export default {async fetch(req,env){try{return secureHeaders(await route(req,env))}catch(e){console.error('Request error',e?.message);return secureHeaders(err('Request failed',500))}}};

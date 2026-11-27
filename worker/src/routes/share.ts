// The phone share target. GET so an Access login redirect round-trips without losing the payload.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../auth/access';

export const share = new Hono<AppEnv>();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

share.get('/share', requireOwner, (c) => {
  const q = c.req.query();
  const url = q.url ?? (q.text?.match(/https?:\/\/\S+/)?.[0] ?? '');
  const text = q.text && q.text !== url ? q.text : '';
  const title = q.title ?? '';
  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Save</title>
<style>
:root{--paper:#f4ecdf;--ink:#1a1a18;--green:#243d32;--pink:#ecd0c7;--rule:#b9ab93}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.4 Georgia,serif;padding:1.25rem;max-width:34rem}
label,.mono{font:500 .78rem/1.2 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:#4a4843}
input,textarea{width:100%;box-sizing:border-box;font:inherit;background:#fff8;border:1px solid var(--rule);padding:.6rem .7rem;margin:.3rem 0 1rem}
textarea{min-height:5.5rem}
.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:.3rem 0 1rem}
.chips label{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--rule);padding:.45rem .7rem;cursor:pointer}
.chips input{width:auto;margin:0}
.chips label:has(input:checked){background:var(--green);color:#f7efe2;border-color:var(--green)}
button{font:500 .85rem/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;background:var(--green);color:#f7efe2;border:0;padding:.9rem 1.4rem;width:100%}
#status{margin-top:1rem;padding:1rem;background:var(--pink);display:none}
h1{font-weight:400;font-size:1.6rem;margin:.2rem 0 1rem}
</style></head><body>
<p class="mono">Save to the inbox</p>
<h1>${esc(title || url || 'New capture')}</h1>
<form id="f">
<label>Link</label><input name="url" value="${esc(url)}" inputmode="url" autocomplete="off">
<label>Why I'm interested</label><textarea name="why" placeholder="One sentence, in your voice.">${esc(text)}</textarea>
<label>File as</label>
<div class="chips">
<label><input type="radio" name="intent" value="" checked>Let the agent decide</label>
<label><input type="radio" name="intent" value="list">List</label>
<label><input type="radio" name="intent" value="feed">Notes</label>
<label><input type="radio" name="intent" value="review">Review</label>
<label><input type="radio" name="intent" value="writing">Writing</label>
</div>
<label>Visibility</label>
<div class="chips">
<label><input type="radio" name="visibility" value="public" checked>Public after processing</label>
<label><input type="radio" name="visibility" value="private">Private</label>
</div>
<input type="hidden" name="title" value="${esc(title)}">
<button type="submit">Save</button>
</form>
<div id="status"></div>
<script>
const f=document.getElementById('f'),st=document.getElementById('status');
let cid=sessionStorage.getItem('cid');if(!cid){cid=crypto.randomUUID();sessionStorage.setItem('cid',cid)}
f.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));d.client_id=cid;
st.style.display='block';st.textContent='Saving…';
try{const r=await fetch('/api/captures',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify(d)});
const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);
sessionStorage.removeItem('cid');st.innerHTML='Saved. The agent will take it from here. <a href="/private/">Open the inbox</a>';f.querySelector('button').disabled=true;}
catch(err){st.textContent='Not saved: '+err.message+' — tap Save to retry.'}});
</script></body></html>`);
});

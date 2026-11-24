const byId = id => document.getElementById(id);
const entry = byId('entry');
const f = entry.elements;
const lookup = byId('lookup');
const address = lookup.elements.url;
const saved = byId('saved');
const message = text => { byId('message').textContent = text; };
const groups = {interested:'Interested',wishlist:'Wishlist',gifts:'Gifts for You'};
const fields = ['name','note','label','brand','category','type','price','details','image'];
const api = '/api/list-editor';
let catalog, currentId, currentUrl, previewSequence = 0;
const pendingKey = 'list-editor-pending';
function pending(value) {
  try {
    if (value===undefined) return sessionStorage.getItem(pendingKey);
    if (value) sessionStorage.setItem(pendingKey,value);
    else sessionStorage.removeItem(pendingKey);
  } catch { /* Paste a URL after signing in when browser storage is unavailable. */ }
}
function valid(value) {
  try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
function key(value) {
  if (!valid(value)) return '';
  const u=new URL(value);
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.hostname.replace(/^www\./,'')+u.port+u.pathname.replace(/\/$/,'')+u.search;
}
function signIn() {
  pending(address.value);
  byId('editor').hidden=byId('logout').hidden=true;
  byId('login').hidden=false;
  message(location.search.includes('login=failed')?'Sign in with the GitHub account that owns this site.':'Sign in to add or edit an item.');
}
async function request(body) {
  const response=await fetch(api,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  if (response.status===401) { signIn(); throw new Error('Sign in to continue.'); }
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || (response.status===409?'The list changed. Reopen the saved item to load the latest version.':response.status===400?'Check the link, title, image URL and price.':'The site could not reach the editor service. Please try again.'));
  return result;
}
function menu() {
  saved.replaceChildren(new Option('New entry',''));
  for (const [group,label] of Object.entries(groups)) {
    const options=document.createElement('optgroup');
    options.label=label;
    for (const item of catalog.lists[group]) options.append(new Option(item.name,item.id));
    saved.append(options);
  }
  for (const field of ['brand','category','type']) {
    const values=[...new Set(catalog.lists.wishlist.map(i=>i[field]).filter(Boolean))].sort();
    byId(field==='category'?'categories':field+'s').replaceChildren(...values.map(v=>new Option(v,v)));
  }
}
function displayGroup() {
  const wish=f.group.value==='wishlist';
  byId('wishFields').hidden=!wish;
  byId('pickLabel').hidden=wish;
}
function displayPhoto() {
  const img=byId('photo'), value=f.image.value.trim();
  if (valid(value) || /^\/wishlist\/img\/[\w.-]+$/.test(value)) {
    img.hidden=false;
    img.src=value;
  } else { img.hidden=true; img.removeAttribute('src'); }
}
byId('photo').onerror=()=>{byId('photo').hidden=true;};
function show(group,item) {
  currentId=item.id || null;
  currentUrl=item.url;
  saved.value=currentId || '';
  address.value=currentUrl;
  for (const field of fields) f[field].value=item[field] ?? '';
  f.group.value=group;
  byId('save').textContent=currentId?'Save changes':'Add to list';
  displayGroup();
  displayPhoto();
  entry.hidden=false;
}
function findItem(predicate) {
  for (const group of Object.keys(groups)) {
    const item=catalog.lists[group].find(predicate);
    if (item) return {group,item};
  }
}
function isHostname(name,url) {
  return String(name || '').toLowerCase().replace(/^www\./,'')===new URL(url).hostname.replace(/^www\./,'');
}
let references;
async function referenceFields(value) {
  try {
    references ||= fetch('./reference-previews.json?v=1').then(r=>{if(!r.ok) throw new Error(); return r.json();});
    const catalog=await references;
    const url=new URL(value);
    const variant=url.searchParams.get('variant');
    url.search='';
    url.hash='';
    if (variant) url.searchParams.set('variant',variant);
    return catalog[key(url.href)] || {};
  } catch {references=null;return {};}
}
byId('alternateLookup').onclick=async()=>{
  const sequence=previewSequence;
  const url=currentUrl;
  const button=byId('alternateLookup');
  button.disabled=true;
  message('Checking Microlink…');
  try {
    const endpoint=new URL('https://api.microlink.io/');
    endpoint.searchParams.set('url',url);
    const response=await fetch(endpoint,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error();
    const {data}=await response.json();
    if (sequence!==previewSequence) return;
    if (!data?.title) throw new Error();
    const values={name:data.title,brand:data.publisher,label:data.publisher,image:data.image?.url || data.logo?.url,
      note:data.description ? 'From the shop: '+data.description.slice(0,320) : ''};
    for (const [field,value] of Object.entries(values)) {
      if (value && (!f[field].value || (field==='name' && isHostname(f.name.value,url)))) f[field].value=value;
    }
    displayPhoto();
    byId('alternate').hidden=true;
    message('Loaded the link preview. Review the details before saving.');
  } catch {if(sequence===previewSequence) message('The second source could not load this link. You can still enter the details here.');}
  finally {button.disabled=false;}
};
async function lookUp() {
  const sequence=++previewSequence;
  const pasted=address.value.trim();
  const url=/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(pasted)?'https://'+pasted:pasted;
  if (!valid(url)) { message('Enter a web address starting with https:// or http://.'); return; }
  const match=findItem(item=>key(item.url)===key(url));
  entry.hidden=true;
  message('Looking up item details…');
  byId('alternate').hidden=true;
  let live={};
  try {live=await request({action:'preview',url});}
  catch(e) {if (!byId('login').hidden) throw e;}
  if (isHostname(live.name,url)) delete live.name;
  const reference=live.name && live.image && live.price ? {} : await referenceFields(url);
  if (sequence!==previewSequence) return;
  const item={...match?.item,url:match?.item.url || url};
  const added=[];
  const cached=[];
  for (const field of fields) {
    const value=live[field] || reference[field];
    if (value && (!item[field] || (field==='name' && isHostname(item.name,url)))) {
      item[field]=value;
      added.push(field);
      if (!live[field]) cached.push(field);
    }
  }
  show(match?.group || 'interested',item);
  byId('alternate').hidden=Boolean(item.name && !isHostname(item.name,url) && item.image);
  const prefix=match?'Already on '+groups[match.group]+'. ':'';
  if (cached.length) message(prefix+'Loaded saved shop details. '+(item.price?'Price on file: $'+item.price+'. ':'')+'Review before saving.');
  else if (added.length) message(prefix+'Filled in '+added.join(', ')+'. Review before saving.');
  else if (byId('alternate').hidden) message(prefix+'Showing your saved details.');
  else message(prefix+'The shop lookup returned incomplete details. Try the second source below or enter them yourself.');

}
lookup.onsubmit=event=>{event.preventDefault();lookUp().catch(e=>message(e.message));};
address.oninput=()=>{previewSequence++;entry.hidden=true;byId('alternate').hidden=true;};
saved.onchange=async()=>{
  const id=saved.value;
  byId('alternate').hidden=true;
  previewSequence++;
  entry.hidden=true;
  try {
    catalog=await request();
    menu();
    const match=findItem(i=>i.id===id);
    if (match) {show(match.group,match.item);message('Edit this entry or move it to another list.');}
    else { address.value='';message('Paste a link to add an item.'); address.focus(); }
  } catch(e) { message(e.message); }
};
f.group.onchange=displayGroup;
f.image.onchange=displayPhoto;
entry.onsubmit=async event=>{
  event.preventDefault();
  const button=byId('save');
  button.disabled=true;
  try {
    const values=Object.fromEntries(fields.map(key=>[key,f[key].value]));
    const group=f.group.value;
    catalog=await request({action:'save',group,id:currentId,revision:catalog.revision,fields:{...values,url:currentUrl}});
    menu();
    show(group,catalog.lists[group].find(i=>key(i.url)===key(currentUrl)));
    message('Saved to '+groups[group]+'. The public page updates after the site finishes publishing.');
    pending('');
  } catch(e) {message(e.message);} finally {button.disabled=false;}
};
byId('logout').onclick=async()=>{
  const result=await fetch(api+'?logout',{method:'POST'});
  if (result.ok) {pending('');location.replace(location.pathname);}
};
async function start() {
  let shared=location.hash.slice(1) || pending() || '';
  if (!valid(shared)) { try {shared=decodeURIComponent(shared);} catch {shared='';} }
  if (valid(shared)) {address.value=shared;pending(shared);}
  if (location.hash) history.replaceState(null,'',location.pathname+location.search);
  catalog=await request();
  byId('editor').hidden=byId('logout').hidden=false;
  menu();
  if (address.value) {await lookUp();pending('');}
  else message('Paste a link or choose a saved item.');
}
start().catch(e=>{if (byId('login').hidden) message(e.message);});

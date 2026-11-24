const repo = 'loganerik/loganeastman.com';
const paths = {wishlist:'data/wishlist.json', picks:'data/recommendations.json'};
export const groups = ['wishlist','interested','gifts'];
export function webUrl(value) {
  try {
    const url = new URL(value);
    if (['https:','http:'].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { /* Invalid URL. */ }
}
export function linkKey(value) {
  const url = webUrl(value);
  if (!url) return '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.hostname.replace(/^www\./,'') + url.port + url.pathname.replace(/\/$/,'') + url.search;
}
async function github(token, query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'Logans-list'},
    body:JSON.stringify({query,variables})});
  const result = await response.json();
  if (response.status===401) throw new Error('401');
  if (!response.ok || result.errors) {
    if (result.errors?.some(e => /expected|pull and try again|moved|head oid/i.test(e.message))) throw new Error('409');
    throw new Error('502');
  }
  return result.data;
}
export async function loadCatalog(token) {
  const {repository} = await github(token,`{repository(owner:"loganerik",name:"loganeastman.com"){
    ref(qualifiedName:"refs/heads/main"){target{... on Commit {oid
      wishlist:file(path:"data/wishlist.json"){object{... on Blob{text}}}
      picks:file(path:"data/recommendations.json"){object{... on Blob{text}}}
    }}}}}`);
  const {oid,wishlist,picks} = repository.ref.target;
  return {revision:oid,lists:{wishlist:JSON.parse(wishlist.object.text).items,...JSON.parse(picks.object.text)}};
}
export function updateCatalog(catalog, input) {
  const {lists,revision} = catalog;
  const {group,id,fields} = input;
  if (!groups.includes(group) || !fields || !webUrl(fields.url) || typeof fields.name !== 'string' || !fields.name.trim() ||
    !Object.values(fields).every(v => typeof v==='string' && v.length<=3000)) throw new Error('400');
  if (input.revision!==revision) throw new Error('409');
  const oldGroup = groups.find(g => lists[g].some(i => i.id===id));
  if (id && !oldGroup) throw new Error('409');
  if (groups.some(g=>lists[g].some(i=>i.id!==id && linkKey(i.url)===linkKey(fields.url)))) throw new Error('duplicate');
  const previous = lists[oldGroup]?.find(i => i.id===id);
  const item = {...previous,id:previous?.id || crypto.randomUUID()};
  for (const key of ['name','url','image','note','brand','category','details','type','label']) item[key] = (fields[key] ?? item[key] ?? '').trim();
  if (item.image && !webUrl(item.image) && !/^\/wishlist\/img\/[\w.-]+$/.test(item.image)) throw new Error('400');
  if (group==='wishlist') {
    item.brand ||= new URL(item.url).hostname.replace(/^www\./,'');
    item.category ||= 'Other';
    item.price = fields.price?.trim() ? Number(fields.price) : null;
    if (item.price!==null && (!Number.isFinite(item.price)||item.price<0)) throw new Error('400');
    item.dateAdded ||= new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  if (oldGroup===group) lists[group][lists[group].indexOf(previous)]=item;
  else {
    if (oldGroup) lists[oldGroup]=lists[oldGroup].filter(i=>i.id!==id);
    lists[group].unshift(item);
  }
  return {item,changed:new Set([group,oldGroup].filter(Boolean).map(g=>g==='wishlist'?'wishlist':'picks'))};
}
export async function publish(token,catalog,change) {
  const additions = [...change.changed].map(key=>{
    const data = key==='wishlist'?{items:catalog.lists.wishlist}:{interested:catalog.lists.interested,gifts:catalog.lists.gifts};
    const bytes = new TextEncoder().encode(JSON.stringify(data,null,2)+'\n');
    return {path:paths[key],contents:btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))};
  });
  const data = await github(token,'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',
    {input:{branch:{repositoryNameWithOwner:repo,branchName:'main'},expectedHeadOid:catalog.revision,
      message:{headline:'Update list: '+change.item.name.slice(0,90)},fileChanges:{additions}}});
  return data.createCommitOnBranch.commit.oid;
}

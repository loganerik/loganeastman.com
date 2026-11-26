import {login, logout, readSession} from '../../lib/wishlist/session.js';
import {loadCatalog, updateCatalog, publish} from '../../lib/wishlist/catalog.js';
import {preview} from '../../lib/wishlist/preview.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function onRequest({request,env}) {
  const url=new URL(request.url);
  if (request.method==='GET' && url.searchParams.has('login')) return login(request,env);
  if (request.method==='POST' && request.headers.get('Origin')!==url.origin) return json({},403);
  if (request.method==='POST' && url.searchParams.has('logout')) return logout();
  const token=await readSession(request,env);
  if (!token) return json({},401);
  try {
    if (request.method==='GET') return json(await loadCatalog(token));
    if (request.method!=='POST') return json({},405);
    const data=await request.json().catch(()=>null);
    if (!data) return json({},400);
    if (data.action==='preview') return json(await preview(data.url).catch(()=>({})));
    if (data.action!=='save') return json({},400);
    const catalog=await loadCatalog(token);
    const change=updateCatalog(catalog,data);
    catalog.revision=await publish(token,catalog,change);
    return json(catalog);
  } catch (e) {
    if (e.message==='duplicate') return json({error:'That link already has an entry. Open it from the saved items menu.'},409);
    const status=Number(e.message);
    return json({},[400,401,409].includes(status)?status:502);
  }
}

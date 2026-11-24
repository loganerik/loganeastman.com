const editorPath = '/wishlist/add/';
const stateCookie = 'list_login';
const cookie = (name, value, age) => name + '=' + value + '; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=' + age;
const getCookie = (request, name) => (request.headers.get('Cookie') || '').split('; ').find(v => v.startsWith(name + '='))?.slice(name.length + 1);
const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), ch => ch.charCodeAt(0));

async function sessionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('list-editor:' + secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function readSession(request, env) {
  try {
    const [iv, data] = getCookie(request, 'list_session').split('.');
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(iv)}, await sessionKey(env.GITHUB_CLIENT_SECRET), decode(data));
    const session = JSON.parse(new TextDecoder().decode(bytes));
    if (session.expires > Date.now()) return session.token;
  } catch { /* Missing, expired or invalid session. */ }
  return null;
}
export function login(request, env) {
  const state = 'list-' + crypto.randomUUID();
  const auth = new URL('https://github.com/login/oauth/authorize');
  auth.search = new URLSearchParams({client_id:env.GITHUB_CLIENT_ID, scope:'public_repo', state,
    redirect_uri:new URL('/api/callback', request.url).href});
  return new Response(null, {status:302, headers:{Location:auth.href, 'Set-Cookie':cookie(stateCookie,state,600),'Cache-Control':'no-store'}});
}
export function logout() {
  return new Response(null, {status:204,headers:{'Set-Cookie':cookie('list_session','',0),'Cache-Control':'no-store'}});
}
export async function finishLogin(request, env) {
  const query = new URL(request.url).searchParams;
  const headers = new Headers({Location:editorPath + '?login=failed','Cache-Control':'no-store'});
  headers.append('Set-Cookie', cookie(stateCookie,'',0));
  if (query.get('code') && query.get('state') === getCookie(request,stateCookie)) {
    const result = await fetch('https://github.com/login/oauth/access_token', {method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({
        client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:query.get('code'),
        redirect_uri:new URL('/api/callback',request.url).href})});
    const {access_token:token} = await result.json();
    if (token) {
      const user = await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token,'User-Agent':'Logans-list'}});
      if (user.ok && (await user.json()).id === 187993937) {
        const lifetime = 30*86400;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({name:'AES-GCM',iv},await sessionKey(env.GITHUB_CLIENT_SECRET),
          new TextEncoder().encode(JSON.stringify({token,expires:Date.now()+lifetime*1000})));
        headers.append('Set-Cookie',cookie('list_session',encode(iv)+'.'+encode(new Uint8Array(data)),lifetime));
        headers.set('Location',editorPath);
      }
    }
  }
  return new Response(null,{status:302,headers});
}

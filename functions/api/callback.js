// GitHub OAuth, step 2: exchange the code for a token and hand it to Decap
// through the postMessage handshake it expects.
//
// Decap only answers the handshake in the editor tab that opened this popup,
// so the page keeps knocking until it gets an answer, shows real errors
// instead of "Signing in…", and after a while tells the editor what to do.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";
  const saved = (cookie.match(/decap_oauth_state=([^;]+)/) || [])[1];
  const fail = (msg) => page("error", msg);
  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") || url.searchParams.get("error"));
  }
  if (!code) return fail("GitHub did not send a code back. Close this window and try again.");
  if (!state || state !== saved) {
    return fail("This sign-in attempt is stale (it was probably started twice). Close this window and click Login once.");
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "tryhard-decap-auth" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data = await res.json();
  if (!data.access_token) return fail(data.error_description || "GitHub did not return a token.");
  return page("success", JSON.stringify({ token: data.access_token, provider: "github" }));
}

function page(status, payload) {
  const content = status === "success" ? payload : JSON.stringify(payload);
  const message = status === "success" ? "Signed in. Handing back to the editor…" : payload;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>TRYHARD editor sign-in</title>
<style>
  body{font:16px/1.5 Georgia,serif;color:#111;background:#f6f1e7;margin:0;padding:2.5rem 1.5rem;max-width:34rem}
  h1{font:600 13px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#1f4d3a;margin:0 0 1rem}
  p{margin:0 0 .75rem}
  .err{color:#8a1c1c}
  .hint{display:none;color:#555;font-size:15px}
</style></head><body>
<h1>TRYHARD editor</h1>
<p id="msg" class="${status === "error" ? "err" : ""}">${escapeHtml(message)}</p>
<p id="hint" class="hint">The editor tab that opened this window is not answering. Close this window, go back to the editor tab (reload it if it was open a long time) and click <strong>Login with GitHub</strong> once.</p>
<script>
(function () {
  var status = ${JSON.stringify(status)};
  var content = ${JSON.stringify(content)};
  var opener = window.opener;
  var hint = document.getElementById('hint');
  var msg = document.getElementById('msg');
  if (!opener) { hint.style.display = 'block'; return; }
  var answered = false;
  function receive(e) {
    if (e.data !== 'authorizing:github') return;
    answered = true;
    window.removeEventListener('message', receive, false);
    opener.postMessage('authorization:github:' + status + ':' + content, e.origin);
    if (status === 'success') { msg.textContent = 'Signed in. You can close this window.'; }
    setTimeout(function () { try { window.close(); } catch (err) {} }, 400);
  }
  window.addEventListener('message', receive, false);
  var tries = 0;
  var timer = setInterval(function () {
    if (answered) { clearInterval(timer); return; }
    tries += 1;
    try { opener.postMessage('authorizing:github', '*'); } catch (err) {}
    if (tries >= 12) { clearInterval(timer); hint.style.display = 'block'; }
  }, 500);
  try { opener.postMessage('authorizing:github', '*'); } catch (err) {}
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "decap_oauth_state=; Path=/api; Max-Age=0" },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// GitHub OAuth, step 2: exchange the code for a token and hand it to Decap
// through the postMessage handshake it expects.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";
  const saved = (cookie.match(/decap_oauth_state=([^;]+)/) || [])[1];
  const fail = (msg) => page("error", msg);
  if (!code) return fail("Missing code from GitHub.");
  if (!state || state !== saved) return fail("State mismatch. Please try signing in again.");

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
  const html = `<!doctype html><html><body><script>
    (function () {
      function receive(e) {
        window.opener.postMessage('authorization:github:${status}:' + ${JSON.stringify(content)}, e.origin);
        window.removeEventListener('message', receive, false);
      }
      window.addEventListener('message', receive, false);
      window.opener.postMessage('authorizing:github', '*');
    })();
  </script><p>Signing in…</p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "decap_oauth_state=; Path=/api; Max-Age=0" },
  });
}

// GitHub OAuth, step 1: send the editor to GitHub's consent screen.
// Deployed automatically by Cloudflare Pages from /functions.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("GITHUB_CLIENT_ID is not set on the Pages project.", { status: 500 });
  const state = crypto.randomUUID();
  const redirect = `${url.origin}/api/callback`;
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", clientId);
  gh.searchParams.set("redirect_uri", redirect);
  gh.searchParams.set("scope", "repo,user");
  gh.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      "Set-Cookie": `decap_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

// Runs on every public page. Visitors never call the API: only a browser that has signed in before
// (localStorage.ownerHint) asks /api/me, then owner-only templates are stamped into place.
(() => {
  try {
    const fromPrivate = document.referrer.includes('/private');
    if (!localStorage.getItem('ownerHint') && !fromPrivate) return;
    if (fromPrivate) localStorage.setItem('ownerHint', '1');
  } catch {
    return;
  }
  const cached = sessionStorage.getItem('owner');
  const stamp = () => {
    document.documentElement.dataset.owner = '1';
    document.querySelectorAll<HTMLTemplateElement>('template[data-owner-only]').forEach((t) => t.replaceWith(t.content.cloneNode(true)));
  };
  if (cached && Date.now() - Number(cached) < 5 * 60_000) {
    stamp();
    return;
  }
  fetch('/api/me', { credentials: 'include' })
    .then((r) => {
      if (r.ok) {
        sessionStorage.setItem('owner', String(Date.now()));
        stamp();
      } else if (r.status === 401 || r.status === 403) {
        localStorage.removeItem('ownerHint');
        sessionStorage.removeItem('owner');
      }
    })
    .catch(() => {});
})();

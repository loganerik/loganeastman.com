function saved(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function remember(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* The button also works without storage. */ }
}

for (const pick of document.querySelectorAll('.like')) {
  const id = pick.dataset.id;
  const key = 'gift-like-' + id;
  const open = pick.querySelector('.like-open');
  const form = pick.querySelector('form');
  const status = pick.querySelector('[role=status]');
  const name = form.elements.name;
  const requestId = saved(key + '-request') || crypto.randomUUID();
  remember(key + '-request', requestId);

  function complete() {
    form.hidden = open.hidden = true;
    status.textContent = 'Liked. Your name and gift choice were saved for Logan.';
  }
  if (saved(key) === 'sent') complete();
  else open.hidden = false;

  open.onclick = () => {
    open.hidden = true;
    form.hidden = false;
    name.value = name.value || saved('gift-like-name') || '';
    name.focus();
  };
  form.querySelector('.like-cancel').onclick = () => {
    form.hidden = true;
    open.hidden = false;
    status.textContent = '';
    open.focus();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const visitor = name.value.trim();
    if (!visitor) { name.value = ''; name.reportValidity(); return; }
    const controls = Array.from(form.elements);
    controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/gift-like', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id, name:visitor, requestId })
      });
      if (!response.ok || !(await response.json()).sent) throw new Error();
      remember('gift-like-name', visitor);
      remember(key, 'sent');
      complete();
    } catch {
      status.textContent = 'Couldn’t confirm delivery. Please try again.';
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  };
}

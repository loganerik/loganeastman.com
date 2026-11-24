const el = id => document.getElementById(id);
const grid = document.querySelector('.grid');
const cards = [...grid.children];
const filters = el('filters');
const nameOf = card => card.querySelector('h2').textContent;

function updateList() {
  const apparel = el('category').value === 'Apparel';
  el('type-control').hidden = !apparel;
  if (!apparel) el('type').value = '';
  const sort = el('sort').value;
  const ordered = [...cards].sort((a, b) => {
    if (sort === 'asc' || sort === 'desc') {
      const x = a.dataset.price, y = b.dataset.price;
      if (!x || !y) return Number(!x) - Number(!y);
      return sort === 'asc' ? x - y : y - x;
    }
    if (sort === 'name') return nameOf(a).localeCompare(nameOf(b));
    if (sort === 'brand' || sort === 'category') return a.dataset[sort].localeCompare(b.dataset[sort]);
    return 0;
  });
  let count = 0;
  for (const card of ordered) {
    card.hidden = ['brand', 'category', 'type'].some(key => el(key).value && card.dataset[key] !== el(key).value);
    if (!card.hidden) count++;
    grid.append(card);
  }
  el('count').textContent = count + (count === 1 ? ' item' : ' items');
  el('empty').hidden = count !== 0;
}
filters.hidden = false;
filters.addEventListener('change', updateList);
el('reset').onclick = () => { filters.reset(); updateList(); el('category').focus(); };

const share = el('share');
share.hidden = false;
share.onclick = async () => {
  const url = new URL('/wishlist/', location.href).href;
  try {
    if (navigator.share) await navigator.share({ title: 'Logan’s Wishlist', url });
    else { await navigator.clipboard.writeText(url); share.textContent = 'Link copied'; }
  } catch (error) {
    if (error.name !== 'AbortError') window.prompt('Copy the wishlist link', url);
  }
};

const dialog = document.querySelector('dialog');
let activeCard;
let version = 0;

function buyerKey() {
  const storageKey = 'wishlist-buyer-key-v1';
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
}

async function giftAction(action) {
  const ticket = ++version;
  const card = activeCard;
  for (const id of ['claim', 'release', 'email', 'retry']) el(id).hidden = true;
  el('status').textContent = action === 'check' ? 'Checking this gift…' : 'Saving…';
  try {
    const response = await fetch('/api/wishlist', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id: card.dataset.id, key: buyerKey() })
    });
    if (!response.ok) throw new Error();
    const { state } = await response.json();
    if (ticket !== version) return;
    if (state === 'available') {
      el('status').textContent = 'Available. Claim it to let other buyers know you’re getting it. Logan won’t receive a notification.';
      el('claim').hidden = false;
    } else if (state === 'yours') {
      el('status').textContent = 'You’ve claimed this gift. You can email a friend or relative from your mail app, or return here in this browser to release it.';
      const body = 'I’m getting Logan the ' + nameOf(card) + ' (' + card.dataset.brand + ') from the Christmas wishlist. I’ve claimed it so we don’t double up. Please keep it a surprise!';
      el('email').href = 'mailto:?subject=' + encodeURIComponent('Between us: a gift for Logan') + '&body=' + encodeURIComponent(body);
      el('email').hidden = el('release').hidden = false;
    } else if (state === 'taken') {
      el('status').textContent = 'Someone’s already getting this gift. Pick another item to keep the surprise.';
    } else throw new Error();
  } catch {
    if (ticket !== version) return;
    el('status').textContent = 'Shared gift status is unavailable. You can check with another buyer by email, or try again.';
    el('email').href = 'mailto:?subject=' + encodeURIComponent('A quick gift check for Logan')
      + '&body=' + encodeURIComponent('I’m considering the ' + nameOf(card) + ' for Logan. Do you know if anyone is already getting it? Please keep it a surprise!');
    el('email').hidden = false;
    el('retry').hidden = false;
  }
}
for (const card of cards) {
  const details = card.querySelector('.details');
  details.hidden = false;
  details.onclick = () => {
    activeCard = card;
    el('gift-name').textContent = nameOf(card);
    dialog.showModal();
    giftAction('check');
  };
}
el('close').onclick = () => dialog.close();
dialog.addEventListener('close', () => { version++; });
el('claim').onclick = () => giftAction('claim');
el('release').onclick = () => giftAction('release');
el('retry').onclick = () => giftAction('check');

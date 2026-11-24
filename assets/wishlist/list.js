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
    if (sort === 'newest') return b.dataset.added.localeCompare(a.dataset.added);
    if (sort === 'oldest') return a.dataset.added.localeCompare(b.dataset.added);
    if (sort === 'name') return nameOf(a).localeCompare(nameOf(b));
    if (sort === 'brand' || sort === 'category') return a.dataset[sort].localeCompare(b.dataset[sort]);
    return 0;
  });
  const listView = document.body.classList.contains('compact');
  const grouped = listView && (sort === 'original' || sort === 'category');
  if (grouped && sort === 'original') ordered.sort((a,b) => a.dataset.category.localeCompare(b.dataset.category));
  for (const heading of grid.querySelectorAll('.category-heading')) heading.remove();
  let previousGroup;
  let count = 0;
  for (const card of ordered) {
    card.hidden = ['brand', 'category', 'type'].some(key => el(key).value && card.dataset[key] !== el(key).value);
    if (!card.hidden) {
      if (grouped && previousGroup !== card.dataset.category) {
        const heading = document.createElement('h2');
        heading.className = 'category-heading';
        heading.textContent = card.dataset.category;
        grid.append(heading);
        previousGroup = card.dataset.category;
      }
      count++;
    }
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
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: "Logan's List", url });
    else { await navigator.clipboard.writeText(url); share.textContent = 'Link copied'; }
  } catch (error) {
    if (error.name !== 'AbortError') window.prompt('Copy the wishlist link', url);
  }
};


const views = document.querySelector('.views');

let manualSort = false;
el('sort').addEventListener('change', () => { manualSort = true; });

function applyView() {
  const params = new URLSearchParams(location.search);
  const compact = params.get('view') === 'list';
  const pictures = params.get('pictures') !== 'off';
  if (!manualSort) el('sort').value = compact ? 'original' : 'newest';
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('no-pictures', compact && !pictures);
  el('pictures-control').hidden = !compact;
  el('pictures').checked = pictures;
  for (const id of ['gallery', 'list']) el(id).removeAttribute('aria-current');
  el(compact ? 'list' : 'gallery').setAttribute('aria-current', 'page');
  updateList();
}
views.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const url = new URL(location.href);
  if (link.id === 'list') url.searchParams.set('view', 'list');
  else url.searchParams.delete('view');
  history.pushState(null, '', url);
  applyView();
});
el('pictures').onchange = () => {
  const url = new URL(location.href);
  if (el('pictures').checked) url.searchParams.delete('pictures');
  else url.searchParams.set('pictures', 'off');
  history.replaceState(null, '', url);
  applyView();
};
window.addEventListener('popstate', applyView);
applyView();

const dialog = el('gift-dialog');
const confirmGift = el('gift-confirm');
const message = el('gift-message');
let selectedGift;
let operation;
let requestNumber = 0;

function hideGift() {
  requestNumber++;
  message.textContent = '';
  selectedGift = null;
}
dialog.addEventListener('close', hideGift);
el('gift-close').onclick = () => dialog.close();
window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); });
for (const controls of grid.querySelectorAll('.gift-buttons')) controls.hidden = false;

grid.addEventListener('click', event => {
  const button = event.target.closest('[data-gift]');
  if (!button) return;
  const card = button.closest('article');
  selectedGift = card.dataset.id;
  operation = button.dataset.gift;
  el('gift-name').textContent = nameOf(card);
  const checking = operation === 'check';
  message.textContent = checking
    ? 'Reveal whether someone has claimed this gift? Close to keep it a surprise.'
    : 'Confirm you got this gift. Other buyers can check its status. Logan won’t be notified.';
  confirmGift.textContent = checking ? 'Reveal' : 'Confirm claim';
  confirmGift.hidden = false;
  confirmGift.disabled = false;
  dialog.showModal();
});

function giftKey(action) {
  // A status check also works with browser storage disabled.
  const storage = 'wishlist-buyer-key-v1';
  if (action === 'check') {
    try { return localStorage.getItem(storage) || crypto.randomUUID(); }
    catch { return crypto.randomUUID(); }
  }
  const key = localStorage.getItem(storage) || crypto.randomUUID();
  localStorage.setItem(storage, key);
  return key;
}

confirmGift.onclick = async () => {
  const ticket = ++requestNumber;
  confirmGift.disabled = true;
  message.textContent = 'One moment…';
  try {
    const response = await fetch('/api/wishlist', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedGift, action: operation, key: giftKey(operation) })
    });
    if (!response.ok) throw new Error();
    const { state } = await response.json();
    if (ticket !== requestNumber || !dialog.open) return;
    const messages = {
      available: operation === 'release' ? 'Your claim was removed.' : 'No one has claimed this gift yet.',
      taken: 'Someone has already claimed this gift.',
      yours: 'You’ve claimed this gift.'
    };
    if (!Object.hasOwn(messages, state)) throw new Error();
    message.textContent = messages[state];
    confirmGift.hidden = state !== 'yours';
    if (state === 'yours') {
      operation = 'release';
      confirmGift.textContent = 'Undo my claim';
    }
  } catch {
    if (ticket !== requestNumber || !dialog.open) return;
    message.textContent = 'Couldn’t confirm the gift status. Please try again later.';
    confirmGift.textContent = 'Try again';
  } finally {
    if (ticket === requestNumber) confirmGift.disabled = false;
  }
};

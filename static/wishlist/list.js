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
views.hidden = false;

function applyView() {
  const params = new URLSearchParams(location.search);
  const compact = params.get('view') === 'list';
  const pictures = params.get('pictures') !== 'off';
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

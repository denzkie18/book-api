'use strict';
const $ = id => document.getElementById(id);
let mode = 'latest', page = 1, jsonView = false, responseData = null, controller = null, timer, requestNumber = 0;
const fields = ['q', 'genres', 'tags', 'match', 'perPage', 'book-id'];
function endpoint() {
  if (mode === 'series' || mode === 'book') {
    const id = $('book-id').value;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('Enter a positive, safe local book ID.');
    return `/api/v0/novel/${mode}/${id}`;
  }
  const params = new URLSearchParams();
  for (const key of ['q', 'genres', 'tags']) { const value = $(key).value.trim(); if (value) params.set(key, value); }
  params.set('match', $('match').value); params.set('page', page); params.set('perPage', $('perPage').value);
  return `/api/v0/novel${['latest', 'popular', 'trending'].includes(mode) ? `/${mode}` : ''}?${params}`;
}
function preview() { try { $('request-path').textContent = endpoint(); } catch (e) { $('request-path').textContent = e.message; } }
function notice(message = '', error = false) { $('notice').hidden = !message; $('notice').textContent = message; $('notice').className = `notice${error ? ' error' : ''}`; }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function empty(title, message) { const el = node('div', 'empty'); el.append(node('h3', '', title), node('p', '', message)); $('results').replaceChildren(el); }
function setMode(next, send = true) {
  mode = next; page = 1;
  document.querySelectorAll('[data-mode]').forEach(b => { const active = b.dataset.mode === mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  const detail = ['series', 'book'].includes(mode);
  $('list-fields').hidden = detail; $('detail-fields').hidden = !detail;
  preview(); if (send) schedule();
}
function schedule() {
  clearTimeout(timer); preview();
  // Invalidate a prior response immediately, not only when the next fetch starts.
  requestNumber++; controller?.abort(); $('send').disabled = false; $('results').setAttribute('aria-busy', 'false'); $('results').classList.remove('loading');
  $('status').textContent = $('live').checked ? 'Waiting for your input…' : 'Request changed · press Send request';
  if ($('live').checked) timer = setTimeout(sendRequest, 650);
}
function card(book) {
  const article = node('article', 'book-card'), top = node('div', 'book-top'), info = node('div', 'book-info');
  let cover; const url = book.cover_url ?? book.coverUrl;
  if (url && /^https?:\/\//i.test(url)) {
    cover = node('img', 'cover'); cover.src = url; cover.alt = `${book.title ?? 'Novel'} cover`; cover.loading = 'lazy'; cover.referrerPolicy = 'no-referrer';
    cover.addEventListener('error', () => { const fallback = node('div', 'cover cover-placeholder', 'Cover unavailable'); cover.replaceWith(fallback); }, { once: true });
  } else cover = node('div', 'cover cover-placeholder', 'No cover');
  info.append(node('h3', '', book.title ?? `Book ${book.id}`), node('p', 'meta', `Volume ${book.volume ?? '—'} · ID ${book.id}`));
  if (book.publisher_name) info.append(node('p', 'meta', book.publisher_name));
  if (book.published_date) info.append(node('p', 'meta', `Published ${book.published_date}`));
  top.append(cover, info); article.append(top);
  if (book.genres?.length) { const badges = node('div', 'badges'); book.genres.forEach(g => badges.append(node('span', 'badge', g))); article.append(badges); }
  if (book.description) {
    // Provider markup is displayed as plain text, never injected as HTML.
    const text = book.description.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    article.append(node('p', 'description', text));
  }
  if (book.weighted_score != null || book.popularity != null || book.trending != null) {
    const stats = node('div', 'stats');
    if (book.weighted_score != null) { const score = node('span', '', 'Score '); score.append(node('strong', '', `${book.weighted_score}/100`)); stats.append(score); }
    if (book.popularity != null) { const popularity = node('span', '', 'Popularity '); popularity.append(node('strong', '', new Intl.NumberFormat().format(book.popularity))); stats.append(popularity); }
    if (book.trending != null) { const trending = node('span', '', 'Trending '); trending.append(node('strong', '', new Intl.NumberFormat().format(book.trending))); stats.append(trending); }
    article.append(stats);
  }
  const open = node('button', 'open-book', 'Explore series →'); open.type = 'button';
  open.addEventListener('click', () => { $('book-id').value = book.id; setMode('series', false); sendRequest(); }); article.append(open); return article;
}
function showResponse(data) {
  let books = data.books;
  if (data.book) {
    const b = data.book;
    books = [{ ...b, id: data.bookId ?? b.id, title: typeof b.title === 'object' ? b.title.english ?? b.title.romaji ?? b.title.userPreferred : b.title, cover_url: b.cover_url ?? b.coverUrl ?? b.coverImage?.large, publisher_name: b.publisher_name ?? b.publishers?.map(p => p.name).join(', '), weighted_score: b.weighted_score ?? b.averageScore }];
  }
  if (Array.isArray(books) && books.length) $('results').replaceChildren(...books.map(card));
  else empty('No novels found.', 'Try fewer filters, a different title, or another page.');
  $('json-output').textContent = JSON.stringify(data, null, 2);
  $('results').hidden = jsonView; $('json-output').hidden = !jsonView;
  $('pagination').hidden = !('page' in data) || data.totalPages <= 1;
  $('previous').disabled = page <= 1; $('next').disabled = !data.hasNextPage;
  $('page-label').textContent = `Page ${data.page ?? 1} of ${data.totalPages || 1}`;
}
async function sendRequest() {
  clearTimeout(timer); controller?.abort(); const number = ++requestNumber;
  let path;
  try { path = endpoint(); } catch (e) { notice(e.message, true); $('status').textContent = 'Invalid request'; return; }
  controller = new AbortController(); const ownController = controller;
  const timeout = setTimeout(() => ownController.abort(new Error('Request timed out. Try a smaller page size.')), 120000);
  preview(); notice(); $('send').disabled = true; $('results').setAttribute('aria-busy', 'true'); $('results').classList.add('loading'); $('pagination').hidden = true; $('copy').disabled = true;
  $('status').textContent = 'Requesting metadata… first requests may take a moment.';
  $('json-output').textContent = 'Loading…';
  empty('Fetching your catalog…', 'Cached metadata is reused. New provider calls are paced.');
  const start = performance.now();
  try {
    const response = await fetch(path, { signal: ownController.signal }); const data = await response.json();
    if (number !== requestNumber) return;
    responseData = data; $('copy').disabled = false; $('json-output').textContent = JSON.stringify(data, null, 2);
    if (!response.ok) { const retry = response.headers.get('retry-after'); throw new Error(`${data.message ?? 'Request failed.'}${retry ? ` Retry in ${retry} seconds.` : ''}`); }
    showResponse(data);
    const total = data.total ?? data.totalBooks ?? (data.book ? 1 : 0);
    $('status').textContent = `${response.status} OK · ${total} ${mode === 'series' ? 'volumes' : 'results'} · ${((performance.now() - start) / 1000).toFixed(2)}s`;
    const warnings = data.warnings?.map(w => `${w.provider}: ${w.message}`) ?? Object.entries(data.errors ?? {}).map(([p, m]) => `${p}: ${m}`);
    if (warnings.length) notice(`Partial metadata — ${[...new Set(warnings)].join(' ')}`);
  } catch (e) {
    if (number !== requestNumber) return;
    notice(e.message || 'Unable to complete request.', true); $('status').textContent = 'Request failed';
    empty('The request could not finish.', 'Check the message above and try again.');
  } finally {
    clearTimeout(timeout);
    if (number === requestNumber) { $('send').disabled = false; $('results').setAttribute('aria-busy', 'false'); $('results').classList.remove('loading'); }
  }
}
$('request-form').addEventListener('submit', e => { e.preventDefault(); sendRequest(); });
fields.forEach(id => $(id).addEventListener(['match', 'perPage'].includes(id) ? 'change' : 'input', () => { page = 1; schedule(); }));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('live').addEventListener('change', schedule);
function view(value) { jsonView = value; $('results').hidden = value; $('json-output').hidden = !value; $('cards-view').setAttribute('aria-pressed', String(!value)); $('json-view').setAttribute('aria-pressed', String(value)); }
$('cards-view').addEventListener('click', () => view(false)); $('json-view').addEventListener('click', () => view(true));
$('previous').addEventListener('click', () => { if (page > 1) { page--; sendRequest(); } }); $('next').addEventListener('click', () => { page++; sendRequest(); });
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(responseData, null, 2)); $('copy').textContent = 'Copied'; setTimeout(() => $('copy').textContent = 'Copy JSON', 1500); } catch { notice('Clipboard unavailable. Select and copy the JSON tab instead.'); } });
preview(); sendRequest();

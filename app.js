const $ = (id) => document.getElementById(id);

const state = {
  selected: null,
  results: [],
  availableEpisodes: [],
  currentEpisode: 1,
  activeRoute: 'anilist',
  activeServer: 'zoko',
  currentRange: null,
  ranges: []
};

/* ================= AniList Search ================= */
async function searchAnime() {
  const query = $('searchInput').value.trim();
  if (!query) {
    $('searchStatus').textContent = 'Type an anime title first.';
    return;
  }
  $('searchStatus').textContent = 'Searching AniList…';
  $('searchBtn').disabled = true;

  try {
    const gql = `query ($search:String) {
      Page(perPage:24) {
        media(search:$search, type:ANIME, sort:SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          coverImage { large medium }
          format
          episodes
          seasonYear
          status
          genres
          averageScore
        }
      }
    }`;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { search: query } })
    });

    if (!response.ok) throw new Error(`AniList request failed (${response.status})`);
    const data = await response.json();
    state.results = data?.data?.Page?.media || [];
    renderResults();
    $('searchStatus').textContent = state.results.length
      ? `Found ${state.results.length} results for "${query}".`
      : `No anime found for "${query}".`;
  } catch (err) {
    $('searchStatus').textContent = `Search failed: ${err.message}. Check your connection or try again.`;
  } finally {
    $('searchBtn').disabled = false;
  }
}

function renderResults() {
  $('resultsSection').classList.remove('hidden');
  $('resultCount').textContent = `${state.results.length} titles`;
  const grid = $('animeGrid');
  grid.innerHTML = '';

  state.results.forEach(anime => {
    const title = anime.title.english || anime.title.romaji || anime.title.native || 'Untitled';
    const card = document.createElement('article');
    card.className = 'anime-card';

    const scoreHtml = anime.averageScore
      ? `<span class="card-badge score-badge">★ ${(anime.averageScore / 10).toFixed(1)}</span>`
      : '';
    const formatHtml = anime.format
      ? `<span class="card-badge format-badge">${anime.format}</span>`
      : '';

    card.innerHTML = `
      <div class="poster-wrap">
        <img loading="lazy" src="${anime.coverImage?.large || anime.coverImage?.medium || ''}" alt="${title.replace(/"/g, '&quot;')}">
        <div class="card-badges">
          ${scoreHtml}
          ${formatHtml}
        </div>
        <div class="card-hover-overlay">
          <span class="hover-play-chip">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Select
          </span>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title"></div>
        <div class="card-meta"></div>
      </div>
    `;
    card.querySelector('.card-title').textContent = title;
    card.querySelector('.card-meta').textContent = `${anime.format || 'Anime'} · ${anime.episodes ? anime.episodes + ' eps' : 'Ongoing'} · ${anime.seasonYear || 'Year unknown'}`;
    card.addEventListener('click', () => selectAnime(anime));
    grid.appendChild(card);
  });
}

/* ================= Anime Selection & Episode Fetching ================= */
async function selectAnime(anime) {
  state.selected = anime;
  state.currentEpisode = 1;
  state.availableEpisodes = [];
  state.activeRoute = 'anilist';
  state.activeServer = 'zoko';
  state.currentRange = null;
  state.ranges = [];

  const title = anime.title.english || anime.title.romaji || anime.title.native || 'Untitled';
  const posterUrl = anime.coverImage?.large || anime.coverImage?.medium || '';
  $('selectedPoster').src = posterUrl;
  $('selectedPoster').alt = title;
  $('selectedTitle').textContent = title;

  const backdrop = $('selectedBackdrop');
  if (backdrop && posterUrl) {
    backdrop.style.backgroundImage = `url("${posterUrl}")`;
  }

  const scoreText = anime.averageScore ? `★ Score ${anime.averageScore}%` : 'Score N/A';
  const metaParts = [
    anime.format || 'Anime',
    anime.seasonYear || 'Year unknown',
    anime.episodes ? `${anime.episodes} episodes` : 'Episodes unknown',
    scoreText
  ];
  if (anime.status) metaParts.push(anime.status);
  $('selectedMeta').textContent = metaParts.join(' · ');

  $('configSection').classList.remove('hidden');
  $('urlPanel').classList.add('hidden');
  $('playerSection').classList.add('hidden');
  updateCCButtonState($('languageSelect').value);

  $('configSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

  await loadAnimeEpisodes(anime);
}

function showEpisodeStatus(status) {
  const loading = $('episodeLoading');
  const empty = $('episodeEmpty');
  const error = $('episodeError');
  const row = $('episodeScrollRow');

  loading.classList.add('hidden');
  empty.classList.add('hidden');
  error.classList.add('hidden');

  if (status === 'loading') {
    loading.classList.remove('hidden');
    row.classList.add('hidden');
  } else if (status === 'empty') {
    empty.classList.remove('hidden');
    row.classList.add('hidden');
  } else if (status === 'error') {
    error.classList.remove('hidden');
    row.classList.add('hidden');
  } else if (status === 'ready') {
    row.classList.remove('hidden');
  }
}

async function loadAnimeEpisodes(anime) {
  showEpisodeStatus('loading');
  $('rangeContainer').classList.add('hidden');

  try {
    const gql = `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        status
        episodes
        nextAiringEpisode { episode airingAt }
        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
      }
    }`;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { id: anime.id } })
    });

    if (!response.ok) throw new Error(`AniList media query failed (${response.status})`);
    const data = await response.json();
    const media = data?.data?.Media;
    if (!media) throw new Error('No media returned from AniList');

    // Update metadata from full media object
    if (media.idMal && !anime.idMal) anime.idMal = media.idMal;
    if (media.episodes && !anime.episodes) anime.episodes = media.episodes;
    anime.status = media.status;
    anime.streamingEpisodes = media.streamingEpisodes;
    anime.nextAiringEpisode = media.nextAiringEpisode;

    // Parse actual available episodes from source
    const episodes = parseActualEpisodes(media);
    state.availableEpisodes = episodes;

    if (episodes.length === 0) {
      showEpisodeStatus('empty');
      $('rangeContainer').classList.add('hidden');
      $('urlPanel').classList.add('hidden');
      return;
    }

    showEpisodeStatus('ready');
    const firstEp = episodes[0].number;
    state.currentEpisode = firstEp;

    initEpisodeSelector(episodes, firstEp);
    makeUrls();
  } catch (err) {
    console.error('Failed to load episode data:', err);
    showEpisodeStatus('error');
    $('rangeContainer').classList.add('hidden');
  }
}

function parseActualEpisodes(media) {
  // Embed servers (ZokoAnime / AnimeEmbed) use plain AniList numbering: 1..N.
  // AniList's streamingEpisodes comes from third-party sites and often uses THEIR numbering
  // (e.g. Solo Leveling S1 listed as 13-25), so it is NOT trusted for the episode numbers.

  // 1) Work out how many episodes exist
  let count = null;
  if (media.status === 'RELEASING' && media.nextAiringEpisode?.episode) {
    count = Math.max(1, media.nextAiringEpisode.episode - 1);
  } else if (typeof media.episodes === 'number' && media.episodes > 0) {
    count = media.episodes;
  }

  // Parse streamingEpisodes into {number, item} pairs (used only for titles/thumbnails)
  const streaming = [];
  if (Array.isArray(media.streamingEpisodes)) {
    media.streamingEpisodes.forEach((item, index) => {
      let epNum = null;
      const titleMatch = item.title?.match(/(?:Episode|Session|Ep\.?|Act)\s*(\d+(?:\.\d+)?)/i);
      if (titleMatch) {
        epNum = parseFloat(titleMatch[1]);
      } else if (item.url) {
        const urlMatch = item.url.match(/episode-(\d+(?:\.\d+)?)/i);
        if (urlMatch) epNum = parseFloat(urlMatch[1]);
      }
      if (epNum === null) {
        const leadMatch = item.title?.match(/^(\d+(?:\.\d+)?)\b/);
        if (leadMatch) epNum = parseFloat(leadMatch[1]);
      }
      if (epNum === null) epNum = index + 1;
      streaming.push({ number: epNum, item });
    });
  }

  // 2) Known episode count -> always 1..count
  if (count) {
    // Only reuse streaming titles if ALL their numbers fit inside 1..count (i.e. same numbering)
    const numbersFit = streaming.length > 0 && streaming.every(s => s.number >= 1 && s.number <= count);
    const titleMap = new Map();
    if (numbersFit) {
      streaming.forEach(s => { if (!titleMap.has(s.number)) titleMap.set(s.number, s.item); });
    }

    const episodes = [];
    for (let i = 1; i <= count; i++) {
      const info = titleMap.get(i);
      episodes.push({
        id: i,
        number: i,
        label: String(i),
        title: info?.title || `Episode ${i}`,
        thumbnail: info?.thumbnail || null,
        url: info?.url || null
      });
    }
    return episodes;
  }

  // 3) Unknown count -> fall back to streaming list, re-based so it starts at episode 1
  if (streaming.length > 0) {
    const map = new Map();
    streaming.forEach(s => { if (!map.has(s.number)) map.set(s.number, s.item); });
    const sorted = Array.from(map.keys()).sort((a, b) => a - b);
    const offset = sorted[0] > 1 ? sorted[0] - 1 : 0;
    return sorted.map(n => {
      const info = map.get(n);
      const num = n - offset;
      return {
        id: num,
        number: num,
        label: String(num),
        title: info?.title || `Episode ${num}`,
        thumbnail: info?.thumbnail || null,
        url: info?.url || null
      };
    });
  }

  return [];
}

/* ================= Dynamic Episode Ranges ================= */
function computeRanges(availableEpisodes) {
  if (!availableEpisodes || availableEpisodes.length <= 24) {
    return null; // Small anime: avoid unnecessary range grouping
  }

  const step = availableEpisodes.length <= 50 ? 25 : 50;
  const ranges = [];

  for (let i = 0; i < availableEpisodes.length; i += step) {
    const chunk = availableEpisodes.slice(i, i + step);
    const firstEp = chunk[0];
    const lastEp = chunk[chunk.length - 1];
    ranges.push({
      startNumber: firstEp.number,
      endNumber: lastEp.number,
      label: `${firstEp.label}–${lastEp.label}`,
      episodes: chunk
    });
  }

  return ranges;
}

function initEpisodeSelector(episodes, targetEp) {
  state.ranges = computeRanges(episodes);

  if (!state.ranges) {
    $('rangeContainer').classList.add('hidden');
    state.currentRange = null;
    renderEpisodeButtons(episodes, targetEp);
  } else {
    $('rangeContainer').classList.remove('hidden');
    renderRangeMenu();
    const activeRange = state.ranges.find(r => r.episodes.some(e => e.number === targetEp)) || state.ranges[0];
    selectRange(activeRange);
  }
}

function renderRangeMenu() {
  const menu = $('rangeDropdownMenu');
  menu.innerHTML = '';

  state.ranges.forEach(r => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'range-item';
    item.textContent = r.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRange(r);
      closeRangeMenu();
    });
    menu.appendChild(item);
  });
}

function selectRange(r) {
  state.currentRange = r;

  const menu = $('rangeDropdownMenu');
  menu.querySelectorAll('.range-item').forEach(item => {
    const isThis = item.textContent.trim() === r.label;
    item.classList.toggle('active', isThis);
    item.querySelector('.range-check')?.remove();
    if (isThis) {
      const check = document.createElement('span');
      check.className = 'range-check';
      check.textContent = '✓';
      item.appendChild(check);
    }
  });

  renderEpisodeButtons(r.episodes, state.currentEpisode);
  scrollEpisodeIntoView(state.currentEpisode);
}

function ensureRangeForEpisode(epNumber) {
  if (!state.ranges || state.ranges.length === 0) return;
  if (state.currentRange && state.currentRange.episodes.some(e => e.number === epNumber)) {
    return;
  }
  const matching = state.ranges.find(r => r.episodes.some(e => e.number === epNumber));
  if (matching) {
    selectRange(matching);
  }
}

/* ================= Episode Buttons Row ================= */
function renderEpisodeButtons(episodesList, activeEpNumber) {
  const container = $('episodeScrollRow');
  container.innerHTML = '';
  const frag = document.createDocumentFragment();

  episodesList.forEach(epObj => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `episode-btn${epObj.number === activeEpNumber ? ' active' : ''}`;
    btn.dataset.ep = epObj.number;
    btn.textContent = epObj.label;
    btn.setAttribute('aria-label', `Episode ${epObj.label}`);

    btn.addEventListener('click', () => {
      playEpisode(epObj.number);
    });

    btn.addEventListener('mouseenter', () => showTooltip(btn, epObj));
    btn.addEventListener('mouseleave', hideTooltip);
    btn.addEventListener('focus', () => showTooltip(btn, epObj));
    btn.addEventListener('blur', hideTooltip);

    frag.appendChild(btn);
  });

  container.appendChild(frag);
}

function updateActiveEpisodeButton(activeEpNumber) {
  const container = $('episodeScrollRow');
  container.querySelectorAll('.episode-btn').forEach(btn => {
    const isAct = Number(btn.dataset.ep) === activeEpNumber;
    btn.classList.toggle('active', isAct);
  });
}

function scrollEpisodeIntoView(epNumber) {
  const container = $('episodeScrollRow');
  const btn = container.querySelector(`[data-ep="${epNumber}"]`);
  if (btn) {
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

/* ================= Tooltip ================= */
const tooltip = $('episodeTooltip');

function showTooltip(btn, epObj) {
  const title = epObj.title || `Episode ${epObj.label}`;
  tooltip.textContent = title;
  tooltip.classList.remove('hidden');

  const btnRect = btn.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();

  let left = btnRect.left + (btnRect.width / 2) - (tipRect.width / 2);
  let top = btnRect.top - tipRect.height - 7;

  const margin = 8;
  if (left < margin) {
    left = margin;
  } else if (left + tipRect.width > window.innerWidth - margin) {
    left = window.innerWidth - tipRect.width - margin;
  }

  if (top < margin) {
    top = btnRect.bottom + 7;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

/* ================= Range Dropdown Controls ================= */
function toggleRangeMenu() {
  const menu = $('rangeDropdownMenu');
  const btn = $('rangeDropdownBtn');
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) {
    closeRangeMenu();
  } else {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function closeRangeMenu() {
  const menu = $('rangeDropdownMenu');
  const btn = $('rangeDropdownBtn');
  menu.classList.add('hidden');
  btn.setAttribute('aria-expanded', 'false');
}

$('rangeDropdownBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleRangeMenu();
});

document.addEventListener('click', (e) => {
  if (!$('rangeContainer').contains(e.target)) {
    closeRangeMenu();
  }
});

/* ================= Utility Controls ================= */
function openFindNumber() {
  $('findNumberBtn').classList.add('hidden');
  $('findNumberInputWrap').classList.remove('hidden');
  $('findNumberInput').value = '';
  $('findNumberInput').focus();
}

function closeFindNumber() {
  $('findNumberInputWrap').classList.add('hidden');
  $('findNumberBtn').classList.remove('hidden');
}

function submitFindNumber() {
  const val = parseFloat($('findNumberInput').value);
  if (isNaN(val) || val < 1) {
    $('findNumberInput').focus();
    return;
  }

  // Check if episode genuinely exists in available episodes
  const exists = state.availableEpisodes.find(e => e.number === val);
  if (!exists) {
    alert(`Episode ${val} is not in the available episodes list for this anime.`);
    $('findNumberInput').focus();
    return;
  }

  closeFindNumber();
  playEpisode(val);
}

$('findNumberBtn').addEventListener('click', openFindNumber);
$('findNumberCancel').addEventListener('click', closeFindNumber);
$('findNumberSubmit').addEventListener('click', submitFindNumber);
$('findNumberInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitFindNumber();
  if (e.key === 'Escape') closeFindNumber();
});

document.addEventListener('click', (e) => {
  if (!$('findNumberContainer').contains(e.target)) {
    closeFindNumber();
  }
});

$('micBtn').addEventListener('click', () => {
  const note = 'Voice search is not currently available in this environment.';
  $('searchStatus').textContent = note;
  alert(note);
});

/* ================= Audio Track & CC Subtitle Toggle ================= */
function toggleSubtitles() {
  const select = $('languageSelect');
  const nextLang = select.value === 'sub' ? 'dub' : 'sub';
  select.value = nextLang;
  updateCCButtonState(nextLang);
  if (state.selected) {
    makeUrls();
    if (!$('playerSection').classList.contains('hidden') && $('playerFrame').src !== 'about:blank') {
      playEpisode(state.currentEpisode, state.activeRoute);
    }
  }
}

function updateCCButtonState(lang) {
  const btn = $('ccBtn');
  if (!btn) return;
  if (lang === 'sub') {
    btn.classList.remove('inactive');
    btn.title = 'Subtitles: SUB active (click to switch to DUB)';
  } else {
    btn.classList.add('inactive');
    btn.title = 'Subtitles: DUB active (click to switch to SUB)';
  }
}

$('ccBtn').addEventListener('click', toggleSubtitles);
$('languageSelect').addEventListener('change', () => {
  updateCCButtonState($('languageSelect').value);
  if (state.selected) {
    makeUrls();
    if (!$('playerSection').classList.contains('hidden') && $('playerFrame').src !== 'about:blank') {
      playEpisode(state.currentEpisode, state.activeRoute);
    }
  }
});

/* ================= URL Generation & Playback ================= */
function makeUrls() {
  const anime = state.selected;
  if (!anime) return null;

  const ep = state.currentEpisode || 1;
  const lang = $('languageSelect').value || 'sub';

  // ZokoAnime
  const aniUrl = `https://zokoanime.video/stream/ani/${anime.id}/${ep}/${lang}?autostart=false&asi=0`;
  const malUrl = anime.idMal
    ? `https://zokoanime.video/stream/mal/${anime.idMal}/${ep}/${lang}?autostart=false&asi=0`
    : null;

  // AnimeEmbed  (https://animeembed.com/embed/{ani|mal}/{id}/{episode}?track=sub|dub)
  const aeParams = `track=${lang}&autoPlay=0&muted=0&autoSkip=1&autoNext=0&start=0&accent=9b87ff`;
  const aeAniUrl = `https://animeembed.com/embed/ani/${anime.id}/${ep}?${aeParams}`;
  const aeMalUrl = anime.idMal
    ? `https://animeembed.com/embed/mal/${anime.idMal}/${ep}?${aeParams}`
    : null;

  // Yenime embed URLs; verify route format against Yenime's own tester if their API changes.
  const yenimeAniUrl = `https://player.yenime.net/anime/ani/${anime.id}/${ep}`;
  const yenimeMalUrl = anime.idMal
    ? `https://player.yenime.net/anime/mal/${anime.idMal}/${ep}`
    : null;

  // Kuroko iframe URLs (SUB/DUB supported)
  const kurokoAniUrl = `https://kuroko.cc/embed/ani/${anime.id}/${ep}/${lang}`;
  const kurokoMalUrl = anime.idMal
    ? `https://kuroko.cc/embed/mal/${anime.idMal}/${ep}/${lang}`
    : null;

  // JustPlay (AniList/MAL query-based embed URLs)
  const justplayAniUrl = `https://justplay.boo/embed/?ani=${anime.id}&ep=${ep}&lang=${lang}`;
  const justplayMalUrl = anime.idMal
    ? `https://justplay.boo/embed/?mal=${anime.idMal}&ep=${ep}&lang=${lang}`
    : null;

  const noMal = 'No MAL ID available for this title; AniList route is still generated.';

  $('anilistId').textContent = anime.id;
  $('malId').textContent = anime.idMal || 'Unavailable in AniList metadata';
  $('anilistUrl').textContent = aniUrl;
  $('malUrl').textContent = malUrl || noMal;

  $('aeAnilistId').textContent = anime.id;
  $('aeMalId').textContent = anime.idMal || 'Unavailable in AniList metadata';
  $('aeAnilistUrl').textContent = aeAniUrl;
  $('aeMalUrl').textContent = aeMalUrl || noMal;

  $('yenimeAnilistId').textContent = anime.id;
  $('yenimeMalId').textContent = anime.idMal || 'Unavailable in AniList metadata';
  $('yenimeAnilistUrl').textContent = yenimeAniUrl;
  $('yenimeMalUrl').textContent = yenimeMalUrl || noMal;

  $('kurokoAnilistId').textContent = anime.id;
  $('kurokoMalId').textContent = anime.idMal || 'Unavailable in AniList metadata';
  $('kurokoAnilistUrl').textContent = kurokoAniUrl;
  $('kurokoMalUrl').textContent = kurokoMalUrl || noMal;

  $('justplayAnilistId').textContent = anime.id;
  $('justplayMalId').textContent = anime.idMal || 'Unavailable in AniList metadata';
  $('justplayAnilistUrl').textContent = justplayAniUrl;
  $('justplayMalUrl').textContent = justplayMalUrl || noMal;

  $('urlPanel').classList.remove('hidden');

  return { aniUrl, malUrl, aeAniUrl, aeMalUrl, yenimeAniUrl, yenimeMalUrl, kurokoAniUrl, kurokoMalUrl, justplayAniUrl, justplayMalUrl };
}

function playEpisode(epNumber, route = null, server = null) {
  if (!state.selected) return;
  const anime = state.selected;
  const ep = Number(epNumber) || 1;
  state.currentEpisode = ep;

  if (route) {
    state.activeRoute = route;
  }
  if (server) {
    state.activeServer = server;
  }
  if (state.activeRoute === 'mal' && !anime.idMal) {
    state.activeRoute = 'anilist';
  }

  const urls = makeUrls();
  if (!urls) return;

  const useMal = state.activeRoute === 'mal';
  let targetUrl;
  if (state.activeServer === 'animeembed') {
    targetUrl = useMal && urls.aeMalUrl ? urls.aeMalUrl : urls.aeAniUrl;
  } else if (state.activeServer === 'yenime') {
    targetUrl = useMal && urls.yenimeMalUrl ? urls.yenimeMalUrl : urls.yenimeAniUrl;
  } else if (state.activeServer === 'kuroko') {
    targetUrl = useMal && urls.kurokoMalUrl ? urls.kurokoMalUrl : urls.kurokoAniUrl;
  } else if (state.activeServer === 'justplay') {
    targetUrl = useMal && urls.justplayMalUrl ? urls.justplayMalUrl : urls.justplayAniUrl;
  } else {
    targetUrl = useMal && urls.malUrl ? urls.malUrl : urls.aniUrl;
  }
  const serverName = state.activeServer === 'animeembed' ? 'AnimeEmbed' : (state.activeServer === 'yenime' ? 'Yenime' : (state.activeServer === 'kuroko' ? 'Kuroko' : (state.activeServer === 'justplay' ? 'JustPlay' : 'ZokoAnime')));

  const frame = $('playerFrame');
  $('playerEvents').classList.add('hidden');
  frame.src = targetUrl;
  const title = anime.title.english || anime.title.romaji || anime.title.native || 'Untitled';
  $('playerHeading').textContent = `${title} · Ep ${ep} · ${serverName} · ${state.activeRoute.toUpperCase()} route`;
  $('playerSection').classList.remove('hidden');

  ensureRangeForEpisode(ep);
  updateActiveEpisodeButton(ep);
  scrollEpisodeIntoView(ep);
}

/* ================= Global Events ================= */
$('searchBtn').addEventListener('click', searchAnime);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchAnime(); });

// Generate button generates both URLs simultaneously
$('generateBtn').addEventListener('click', () => {
  makeUrls();
  $('urlPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Retry button for failed episode fetching
$('retryEpisodesBtn').addEventListener('click', () => {
  if (state.selected) {
    loadAnimeEpisodes(state.selected);
  }
});

$('changeAnime').addEventListener('click', () => {
  $('configSection').classList.add('hidden');
  $('urlPanel').classList.add('hidden');
  $('playerSection').classList.add('hidden');
  $('playerFrame').src = 'about:blank';
  hideTooltip();
  $('resultsSection').scrollIntoView({ behavior: 'smooth' });
});

document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
  const urls = makeUrls();
  if (!urls) return;
  const value = {
    'anilist': urls.aniUrl,
    'mal': urls.malUrl,
    'ae-anilist': urls.aeAniUrl,
    'ae-mal': urls.aeMalUrl,
    'yenime-anilist': urls.yenimeAniUrl,
    'yenime-mal': urls.yenimeMalUrl,
    'kuroko-anilist': urls.kurokoAniUrl,
    'kuroko-mal': urls.kurokoMalUrl,
    'justplay-anilist': urls.justplayAniUrl,
    'justplay-mal': urls.justplayMalUrl
  }[btn.dataset.copy];
  if (!value) return;

  const originalHtml = btn.innerHTML;
  try {
    await navigator.clipboard.writeText(value);
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('copied');
    }, 1400);
  } catch {
    prompt('Copy this URL:', value);
  }
}));

document.querySelectorAll('[data-play]').forEach(btn => btn.addEventListener('click', () => {
  const route = btn.dataset.play;
  const server = btn.dataset.server || 'zoko';
  playEpisode(state.currentEpisode, route, server);
  $('playerSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

$('closePlayer').addEventListener('click', () => {
  $('playerFrame').src = 'about:blank';
  $('playerSection').classList.add('hidden');
  hideTooltip();
});

// Horizontal scrolling via mouse wheel
$('episodeScrollRow').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    $('episodeScrollRow').scrollLeft += e.deltaY;
  }
}, { passive: false });

$('episodeScrollRow').addEventListener('scroll', hideTooltip, { passive: true });
window.addEventListener('resize', hideTooltip, { passive: true });

/* ================= Local-file warning & open-in-new-tab ================= */
if (location.protocol === 'file:') {
  $('fileWarning').classList.remove('hidden');
}
$('openPlayerTab').addEventListener('click', () => {
  const src = $('playerFrame').src;
  if (src && src !== 'about:blank') window.open(src, '_blank', 'noopener');
});

/* ================= Trending Tags Quick Search ================= */
document.querySelectorAll('.trend-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $('searchInput').value = chip.textContent.trim();
    searchAnime();
    $('searchInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

/* ================= Global Keyboard Shortcuts ================= */
window.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

  if (e.key === '/' && !isInput) {
    e.preventDefault();
    $('searchInput').focus();
    $('searchInput').select();
  } else if (e.key === 'Escape') {
    if (!$('playerSection').classList.contains('hidden')) {
      $('closePlayer').click();
    }
  }
});

/* ================= AnimeEmbed player events (diagnostics) ================= */
window.addEventListener('message', (event) => {
  const frame = $('playerFrame');
  if (event.source !== frame.contentWindow) return;
  const m = event.data;
  if (!m || m.channel !== 'animeembed' || m.version !== 1) return;
  const box = $('playerEvents');
  let text = `AnimeEmbed: ${m.event}`;
  if (m.event === 'error') {
    text += ` — ${(m.data && m.data.message) || 'unknown error'}`;
  } else if (m.event === 'progress' && m.data) {
    text += ` — ${Math.floor(m.data.currentTime)}s / ${Math.floor(m.data.duration)}s`;
  }
  box.textContent = text;
  box.classList.toggle('is-error', m.event === 'error');
  box.classList.remove('hidden');
  console.log('[AnimeEmbed]', m);
});

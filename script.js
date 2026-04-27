/* ── CONFIGURAÇÃO ── */
const WIKI_PT_API  = 'https://pt.wikipedia.org/w/api.php';
const WIKI_PT_REST = 'https://pt.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_EN_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const ITUNES_API   = 'https://itunes.apple.com/search';

let currentArtist = '';

/* ── INICIALIZAÇÃO ── */
document.getElementById('searchBtn').addEventListener('click', handleSearch);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearch();
});
document.getElementById('questionBtn').addEventListener('click', handleQuestion);
document.getElementById('questionInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleQuestion();
});

function quickSearch(name) {
  document.getElementById('searchInput').value = name;
  handleSearch();
}
window.quickSearch = quickSearch;

/* ── PESQUISA PRINCIPAL ── */
function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;
  currentArtist = query;
  searchArtist(query);
}

async function searchArtist(query) {
  setState('loading');

  try {
    const [wikiData, songs] = await Promise.all([
      fetchWikipedia(query),
      fetchItunes(query),
    ]);
    renderResults(wikiData, songs, query);
    setState('results');
  } catch (err) {
    showError(err.message || 'Não foi possível encontrar informações.');
  }
}

/* ── WIKIPEDIA ── */
async function fetchWikipedia(query) {
  /* 1. Busca no Wikipedia PT */
  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: 5,
    format: 'json',
    origin: '*',
  });

  const searchRes  = await fetch(`${WIKI_PT_API}?${params}`);
  const [, titles] = await searchRes.json();

  if (!titles || titles.length === 0) {
    /* tenta Wikipedia EN como fallback */
    return fetchWikiSummary(WIKI_EN_REST, query);
  }

  /* tenta o primeiro resultado PT */
  try {
    const data = await fetchWikiSummary(WIKI_PT_REST, titles[0]);
    if (data && data.type === 'disambiguation' && titles[1]) {
      return fetchWikiSummary(WIKI_PT_REST, titles[1]);
    }
    return data;
  } catch {
    return fetchWikiSummary(WIKI_EN_REST, query);
  }
}

async function fetchWikiSummary(baseUrl, title) {
  const res  = await fetch(`${baseUrl}${encodeURIComponent(title)}`);
  const data = await res.json();
  if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
    throw new Error('Página não encontrada no Wikipedia.');
  }
  return data;
}

/* ── ITUNES ── */
async function fetchItunes(query) {
  try {
    const params = new URLSearchParams({
      term:   query,
      entity: 'song',
      limit:  15,
    });
    const res  = await fetch(`${ITUNES_API}?${params}`);
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/* ── RENDERIZA RESULTADO ── */
function renderResults(wiki, songs, query) {
  /* nome e imagem */
  const artistName = wiki?.title || query;
  document.getElementById('artistName').textContent = artistName;

  const desc = wiki?.description || '';
  const descEl = document.getElementById('artistDesc');
  descEl.textContent = desc;
  descEl.classList.toggle('hidden', !desc);

  /* imagem */
  const imgWrap = document.getElementById('artistImage');
  if (wiki?.thumbnail?.source) {
    imgWrap.innerHTML = `<img src="${wiki.thumbnail.source}" alt="${escHtml(artistName)}" />`;
  } else {
    imgWrap.innerHTML = '<div class="artist-img-placeholder">🎵</div>';
  }

  /* link wikipedia */
  const wikiLinkEl = document.getElementById('wikiLink');
  const wikiUrl = wiki?.content_urls?.desktop?.page;
  if (wikiUrl) {
    wikiLinkEl.href = wikiUrl;
    wikiLinkEl.classList.remove('hidden');
  } else {
    wikiLinkEl.classList.add('hidden');
  }

  /* biografia */
  const bioSection = document.getElementById('bioSection');
  const bioText    = document.getElementById('bioText');
  if (wiki?.extract) {
    bioText.textContent = wiki.extract;
    bioSection.classList.remove('hidden');
  } else {
    bioSection.classList.add('hidden');
  }

  /* músicas — remove duplicatas por nome */
  const songsSection = document.getElementById('songsSection');
  const songsList    = document.getElementById('songsList');
  const uniqueSongs  = songs.filter((s, i, arr) =>
    arr.findIndex(x => x.trackName === s.trackName) === i
  ).slice(0, 10);

  if (uniqueSongs.length > 0) {
    songsList.innerHTML = uniqueSongs.map((song, i) => `
      <li class="song-item">
        <span class="song-num">${i + 1}</span>
        <div class="song-info">
          <div class="song-name">${escHtml(song.trackName)}</div>
          <div class="song-album">${escHtml(song.collectionName || '')}</div>
        </div>
        ${song.previewUrl
          ? `<audio class="song-preview" controls src="${escHtml(song.previewUrl)}"></audio>`
          : ''}
      </li>
    `).join('');
    songsSection.classList.remove('hidden');
  } else {
    songsSection.classList.add('hidden');
  }

  /* campo de perguntas */
  document.getElementById('questionInput').value = '';
  document.getElementById('questionResult').classList.add('hidden');
  document.getElementById('questionSection').classList.remove('hidden');
}

/* ── CAMPO DE PERGUNTAS ── */
async function handleQuestion() {
  const question = document.getElementById('questionInput').value.trim();
  if (!question || !currentArtist) return;

  const resultEl = document.getElementById('questionResult');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <div class="q-loading">
      <div class="mini-spin"></div>
      Buscando resposta…
    </div>`;

  try {
    const params = new URLSearchParams({
      action:  'query',
      list:    'search',
      srsearch: `${currentArtist} ${question}`,
      srlimit: 4,
      format:  'json',
      origin:  '*',
      srprop:  'snippet',
    });

    const res  = await fetch(`${WIKI_PT_API}?${params}`);
    const data = await res.json();
    const hits = (data.query?.search || []).filter(r => r.snippet);

    if (hits.length === 0) {
      resultEl.innerHTML = `
        <p class="q-results-title">Sem resultados</p>
        <p style="color:var(--muted);font-size:.88rem">
          Não encontramos uma resposta específica. Tente reformular a pergunta.
        </p>`;
      return;
    }

    const items = hits.map(r => `
      <div class="q-result-item">
        <strong>${escHtml(r.title)}</strong>
        <p>${r.snippet.replace(/<[^>]+>/g, '')}…</p>
      </div>`).join('');

    resultEl.innerHTML = `
      <p class="q-results-title">Resultados para: "${escHtml(question)}"</p>
      ${items}`;
  } catch {
    resultEl.innerHTML = `
      <p style="color:var(--muted);font-size:.88rem">
        Erro ao buscar resposta. Tente novamente.
      </p>`;
  }
}

/* ── CONTROLE DE ESTADOS ── */
function setState(state) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('questionSection').classList.add('hidden');

  if (state === 'loading') {
    document.getElementById('loadingState').classList.remove('hidden');
  } else if (state === 'results') {
    document.getElementById('resultsSection').classList.remove('hidden');
  }
}

function showError(msg) {
  setState('');
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorState').classList.remove('hidden');
}

/* ── UTILITÁRIO ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

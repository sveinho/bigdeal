/**
 * Kit Learning App - Part 1: Setup & Initialization (Intelligent JSON-LD Format Version)
 */

const SELECTORS = {
  searchInput: '#searchInput',
  resetBtn: '#resetSearchBtn',
  articlesContainer: '#articlesContainer',
  searchCounter: '#searchCounter',
  noResults: '#noResults',
  loadMoreWrapper: '#loadMoreWrapper',
  loadMoreBtn: '#loadMoreBtn',
  globalTagCloud: '#globalTagCloud',
  filterBtn: '.filter-btn',
  tagToggleCheckbox: '#tagToggleCheckbox'
};

const CONFIG = {
  itemsPerPage: 10,
  debounceMs: 250,
  shareUrl: (id) => `${location.origin}${location.pathname}?id=${id}`,
};

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

const slugify = (text) =>
  text
    ?.trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-') ?? 'heading';

const injectHeadingIds = (container, articleId) => {
  const used = new Set();
  container.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    let base = slugify(h.textContent) || 'heading';
    let id = `${articleId}--${base}`;
    let n = 0;
    while (used.has(id)) {
      n += 1;
      id = `${articleId}--${base}-${n}`;
    }
    used.add(id);
    h.id = id;
  });
};

const rewriteAnchorLinks = (container, articleId) => {
  const prefix = `${articleId}--`;
  container.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.length < 2) return;
    const bare = href.slice(1);
    if (bare.startsWith(prefix)) return;
    if (/^[\w-]+--/.test(bare)) return;
    a.setAttribute('href', `#${prefix}${bare}`);
  });
};

class KitApp {
  #state;
  #refs;
  #md;
  _filterButtons = [];

  constructor() {
    this.#state = {
      all: [],
      filtered: [],
      query: '',
      activeId: null,
      trackFilter: 'all',
      tagFilter: null,
      displayed: CONFIG.itemsPerPage,
    };

    this.#refs = Object.fromEntries(
      Object.entries(SELECTORS).map(([k, sel]) => [k, document.querySelector(sel)])
    );
  }

  async init() {
    this.#bindEvents();
    this.#handleTagVisibility();
    await this.#loadArticles();
    this.#prefetchAllModules(); 
  }

  #bindEvents() {
    const { searchInput, resetBtn, loadMoreBtn, articlesContainer, globalTagCloud, tagToggleCheckbox } = this.#refs;

    searchInput?.addEventListener('input', debounce((e) => this.#onSearch(e.target.value), CONFIG.debounceMs));
    resetBtn?.addEventListener('click', () => this.#reset());
    loadMoreBtn?.addEventListener('click', () => {
      this.#state.displayed += CONFIG.itemsPerPage;
      this.#render();
    });

    globalTagCloud?.addEventListener('click', (e) => {
      const btn = e.target.closest('.global-tag-btn');
      if (btn) this.#toggleTag(btn.dataset.tag);
    });

    tagToggleCheckbox?.addEventListener('change', () => this.#handleTagVisibility());

    articlesContainer?.addEventListener('click', (e) => this.#onArticleClick(e));

    this._filterButtons = Array.from(document.querySelectorAll(SELECTORS.filterBtn));
    this._filterButtons.forEach((btn) =>
      btn.addEventListener('click', () => this.#setTrackFilter(btn.dataset.track, btn))
    );

    window.addEventListener('popstate', () => this.#applyRoute());
  }

  #handleTagVisibility() {
    const { tagToggleCheckbox, globalTagCloud } = this.#refs;
    if (!globalTagCloud || !tagToggleCheckbox) return;

    if (tagToggleCheckbox.checked) {
      globalTagCloud.classList.remove('hidden');
    } else {
      globalTagCloud.classList.add('hidden');
    }
  }

  #syncUrl(params = {}, hash = '') {
    const url = new URL(location.href);
    url.search = '';
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, String(v));
    });
    if (hash) {
      url.hash = hash.startsWith('#') ? hash.slice(1) : hash;
    } else {
      url.hash = '';
    }
    history.pushState({}, '', url);
  }
  /**
   * Kit Learning App - Part 2: Routing, Data Loading & JSON-LD Filtering
   */
  #applyRoute() {
    const url = new URL(location.href);
    const id = url.searchParams.get('id');
    const tag = url.searchParams.get('tag');
    const track = url.searchParams.get('track');

    this.#state.trackFilter = track || 'all';
    
    this._filterButtons.forEach(btn => {
      const isTargetActive = btn.dataset.track === this.#state.trackFilter;
      btn.classList.toggle('active', isTargetActive);
    });

    if (id && this.#state.all.some((a) => (a["@id"] || a.id) === id)) {
      this.#state.activeId = id;
      this.#state.tagFilter = null;
      this.#filter(false);
      this.#ensureLoadedAndScroll(id, url.hash);
    } else if (tag) {
      this.#state.activeId = null;
      this.#state.tagFilter = decodeURIComponent(tag);
      this.#filter(true);
    } else {
      this.#state.activeId = null;
      this.#state.tagFilter = null;
      this.#filter(true);
    }

    this.#renderGlobalTagCloud();
    this.#syncResetButton();
  }

  async #loadArticles() {
    const { articlesContainer } = this.#refs;
    try {
      const res = await fetch('index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawData = await res.json();
      
      this.#state.all = rawData["@graph"] ? rawData["@graph"] : rawData;
      
      this.#renderGlobalTagCloud();
      this.#applyRoute();
    } catch (err) {
      console.error('Failed to load article index:', err);
      if (articlesContainer) {
        articlesContainer.innerHTML = `<p class="error">Could not fetch index. Please ensure you are running via a local development server.</p>`;
      }
    }
  }
async #prefetchAllModules() {
    console.log("Starter bakgrunnslasting av fulltekstindeks...");
    
    // Vi kjører lastingen parallelt, men kontrollert
    const promises = this.#state.all.map(async (article) => {
      // Hvis den allerede har innhold, eller mangler URL, hopper vi over
      if (article.text || article.body || article.markdownContent || !article.url) return;
      
      try {
        const res = await fetch(article.url);
        if (res.ok) {
          const fullModuleData = await res.json();
          article.text = fullModuleData.text || fullModuleData.body || fullModuleData.markdownContent;
        }
      } catch (err) {
        console.warn(`Bakgrunnslasting feilet for ${article.id}:`, err);
      }
    });

    await Promise.all(promises);
    console.log("Fulltekstindeks er ferdig lastet i bakgrunnen! Søk i brødtekst er nå 100 % aktivt.");
    
    // Hvis brukeren allerede har rukket å skrive noe i søkefeltet, kjører vi filteret 
    // på nytt slik at de nye fullteksttreffene dukker opp med en gang.
    if (this.#state.query.length >= 3) {
      this.#filter(false);
    }
  }
  async #ensureLoadedAndScroll(articleId, hash) {
    const article = this.#state.all.find((a) => (a["@id"] || a.id) === articleId);
    if (!article) return;
    
    if (!article.text && !article.body && !article.markdownContent && article.url) {
      try {
        const res = await fetch(article.url);
        if (res.ok) {
          const fullModuleData = await res.json();
          // Lagrer enten objektet eller strengen som kommer fra den fødererte filen
          article.text = fullModuleData.text || fullModuleData.body || fullModuleData.markdownContent;
        }
      } catch (err) {
        console.error('Lazy loading failed for module file:', err);
        article.text = '<p class="error">Error loading document.</p>';
      }
    }
    requestAnimationFrame(() => this.#scrollToAnchor(hash));
  }

  #filter(resetPagination = false) {
    const words = this.#state.query.split(/\s+/).filter(Boolean);
    const isSearching = words.length > 0;
    const { trackFilter, tagFilter, all } = this.#state;

    let result = all.filter((a) => {
      const articleTags = a.keywords || a.tags;
      const articleTrack = a.audience?.educationalRole || a.educationalLevel || a.track;

      if (trackFilter !== 'all' && articleTrack !== trackFilter) return false;
      if (tagFilter && !articleTags?.includes(tagFilter)) return false;
      if (!isSearching) return true;

      const currentName = a.name || a.title || '';
      const currentDesc = a.description || a.abstract || '';
      
      // Henter ut søkbar tekst fra text-egenskapen, enten det er en streng eller et strukturert objekt
      let bodySearchText = '';
      if (a.text) {
        bodySearchText = typeof a.text === 'object' ? (a.text.text || '') : a.text;
      } else {
        bodySearchText = a.body || a.markdownContent || '';
      }

      const haystack = `${currentName} ${currentDesc} ${bodySearchText} ${articleTags?.join(' ') ?? ''}`.toLowerCase();
      
      return words.every((w) => {
        const clean = w.replace(/^\./, '');
        const safe = haystack.replace(/\./g, '');
        return haystack.includes(w) || safe.includes(clean);
      });
    });

    if (isSearching) {
      const first = words ?? '';
      const scoreOf = (title) => {
        const t = (title || '').toLowerCase().trim();
        const c = first.replace(/^\./, '');
        if (t === first || t === c) return 3;
        if (t.startsWith(first) || t.startsWith(c)) return 2;
        return 1;
      };
      result.sort((a, b) => scoreOf(b.name || b.title) - scoreOf(a.name || a.title) || (a.name || a.title || '').localeCompare(b.name || b.title || ''));
    } else {
      result.sort((a, b) => {
        const ta = a.audience?.educationalRole || a.educationalLevel || a.track || '';
        const tb = b.audience?.educationalRole || b.trackFilter || b.track || '';
        if (ta !== tb) return ta.localeCompare(tb);
        
        const orderA = parseInt(a.courseCode || a.order || 0, 10);
        const orderB = parseInt(b.courseCode || b.order || 0, 10);
        return orderA - orderB;
      });
    }

    this.#state.filtered = result;
    if (resetPagination) this.#state.displayed = CONFIG.itemsPerPage;
    this.#render();
  }
  /**
   * Kit Learning App - Part 3: UI Rendering & Intelligent Format Detection
   */
  #render() {
    const { articlesContainer, loadMoreWrapper } = this.#refs;
    const { filtered, displayed } = this.#state;

    this.#updateSearchUI();

    if (!articlesContainer) return;

    if (filtered.length === 0) {
      articlesContainer.innerHTML = '';
      loadMoreWrapper?.classList.add('hidden');
      return;
    }

    const page = filtered.slice(0, displayed);
    articlesContainer.innerHTML = page.map((a) => this.#articleHTML(a)).join('');

    if (this.#state.activeId) {
      const expanded = articlesContainer.querySelector(
        `[data-id="${this.#state.activeId}"] .markdown-body`
      );
      if (expanded) {
        injectHeadingIds(expanded, this.#state.activeId);
        rewriteAnchorLinks(expanded, this.#state.activeId);
      }
    }

    loadMoreWrapper?.classList.toggle('hidden', filtered.length <= displayed);
  }

  #articleHTML(article) {
    const { query, activeId } = this.#state;
    const words = query.split(/\s+/).filter(Boolean);
    
    const currentId = article["@id"] || article.id;
    const isExpanded = currentId === activeId;

    const titleHtml = this.#highlight(article.name ?? article.title ?? '', words);
    const abstractHtml = this.#highlight(article.description ?? article.abstract ?? '', words);
    
    const articleTags = article.keywords || article.tags || [];
    const tagsHtml = articleTags.map((tag) => {
      const activeCls = tag === this.#state.tagFilter ? ' active' : '';
      const tagHtml = this.#highlight(tag, words);
      return `<button class="badge tag-click-btn${activeCls}" data-tag="${tag}">#${tagHtml}</button>`;
    }).join(' ');

    let expandedHtml = '';
    if (isExpanded) {
      const md = this.#getMarkdownRenderer();
      let body = '';
      
      const textProp = article.text || article.body || article.markdownContent;
      
      if (textProp) {
        if (typeof textProp === 'object' && textProp.text) {
          // INTELLIGENT FORMAT-DETEKSJON BASERT PÅ SCHEMA.ORG DEKLARASJON:
          const format = textProp.encodingFormat || '';
          
          if (format === 'text/markdown') {
            body = md ? md.render(textProp.text) : textProp.text;
          } else if (format === 'text/html' || format === 'text/plain') {
            body = textProp.text; // HTML dytes rett inn, ren tekst vises rått
          } else {
            body = textProp.text; // Fallback
          }
        } else if (typeof textProp === 'string') {
          // Fallback hvis innholdet bare er en flat tekststreng (antar Markdown som standard)
          body = md ? md.render(textProp) : textProp;
        }
      }
      
      const currentTrack = article.audience?.educationalRole || article.educationalLevel || article.track;
      const currentOrder = parseInt(article.courseCode || article.order || 0, 10);
      
      const next = this.#state.all.find((a) => {
        const t = a.audience?.educationalRole || a.educationalLevel || a.track;
        const o = parseInt(a.courseCode || a.order || 0, 10);
        return t === currentTrack && o === (currentOrder + 1);
      });
      
      const nextId = next ? (next["@id"] || next.id) : null;
      const nextBtn = next
        ? `<button class="next-step-btn" data-next-id="${nextId}">Neste modul →</button>`
        : '';

      expandedHtml = `
        <div class="full-content">
          <div class="markdown-body">${body}</div>
          <div class="learning-path-actions">
            ${nextBtn}
            <button class="share-btn" data-id="${currentId}">Copy share link 🔗</button>
            <button class="close-article-btn">Close Module ✕</button>
          </div>
        </div>
      `;
    }

    const badgeClass = `badge discipline-badge${isExpanded ? ' is-open' : ''}`;

    return `
      <article class="filterable" data-id="${currentId}">
        <div class="article-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:15px;">
          <h2 class="article-title-clickable" style="cursor:pointer;margin:0;">${titleHtml}</h2>
          <button class="${badgeClass}" data-id="${currentId}" style="cursor:pointer;flex-shrink:0;white-space:nowrap;">
            ${this.#escapeHtml(article.discipline || 'Unknown')}
          </button>
        </div>
        <p class="abstract-text">${abstractHtml}</p>
        ${expandedHtml}
        <div class="article-tags-bottom">${tagsHtml}</div>
      </article>
    `;
  }

  #renderGlobalTagCloud() {
    const cloud = this.#refs.globalTagCloud;
    if (!cloud) return;

    const tags = new Set();
    this.#state.all.forEach((a) => {
      const currentTags = a.keywords || a.tags || [];
      currentTags.forEach((t) => tags.add(t.trim()));
    });
    
    if (tags.size === 0) {
      cloud.innerHTML = '';
      return;
    }

    cloud.innerHTML = Array.from(tags)
      .sort()
      .map((tag) => {
        const active = tag === this.#state.tagFilter ? ' active' : '';
        return `<button class="global-tag-btn${active}" data-tag="${tag}">#${this.#escapeHtml(tag)}</button>`;
      })
      .join(' ');
  }

  #updateSearchUI() {
    const { searchCounter, noResults } = this.#refs;
    const { filtered, query, tagFilter } = this.#state;
    const isSearching = query.length > 0;
    const tagNotice = tagFilter ? ` filtered by #${tagFilter}` : '';

    if (searchCounter) {
      searchCounter.textContent = isSearching
        ? `Found ${filtered.length} matching steps sorted by relevance${tagNotice}`
        : `Track index loaded. Total modules available: ${filtered.length}${tagNotice}`;
    }
    noResults?.classList.toggle('hidden', filtered.length > 0);
  }
  /**
   * Kit Learning App - Part 4: Search Threshold, Color States & Click Handlers
   */
  #onSearch(raw) {
    const cleanQuery = raw.trim().toLowerCase();
    this.#syncResetButton();
    
    if (cleanQuery.length > 0 && cleanQuery.length < 3) {
      this.#state.query = '';
      const { searchCounter } = this.#refs;
      if (searchCounter) {
        searchCounter.textContent = 'Skriv minst 3 tegn for å søke...';
      }
      return;
    }

    this.#state.query = cleanQuery;
    
    const targetParams = {};
    if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
      targetParams.track = this.#state.trackFilter;
    }
    if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;
    
    this.#syncUrl(targetParams);
    this.#filter(true);
  }

  #setTrackFilter(track, activeBtn) {
    this.#state.trackFilter = track;
    this._filterButtons.forEach((b) => b.classList.toggle('active', b === activeBtn));
    
    const activeArticle = this.#state.activeId
      ? this.#state.all.find((a) => (a["@id"] || a.id) === this.#state.activeId)
      : null;
      
    const targetParams = { track };
    if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;

    const currentTrack = activeArticle?.audience?.educationalRole || activeArticle?.educationalLevel || activeArticle?.track;

    if (activeArticle && track !== 'all' && currentTrack !== track) {
      this.#state.activeId = null;
      this.#syncUrl(targetParams);
    } else {
      if (this.#state.activeId) targetParams.id = this.#state.activeId;
      this.#syncUrl(targetParams);
    }
    
    this.#filter(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  #toggleTag(tag) {
    const isActive = this.#state.tagFilter === tag;
    this.#state.tagFilter = isActive ? null : tag;
    
    const targetParams = {};
    if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
      targetParams.track = this.#state.trackFilter;
    }
    if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;
    if (this.#state.activeId) targetParams.id = this.#state.activeId;
    
    this.#syncUrl(targetParams);
    this.#syncResetButton();
    this.#renderGlobalTagCloud();
    this.#filter(true);
  }

  async #selectModule(id, hash = '') {
    if (this.#state.activeId === id) {
      this.#closeActive();
      return;
    }
    this.#state.activeId = id;
    
    const article = this.#state.all.find((a) => (a["@id"] || a.id) === id);
    
    // LATLASTER DEN INDIVIDUELLE JSON-LD MODULFILEN HVIS INNHOLDET IKKE ER I MINNET:
    if (article && !article.text && !article.body && !article.markdownContent && article.url) {
      try {
        const res = await fetch(article.url);
        if (res.ok) {
          const fullModuleData = await res.json();
          // Bevarer det strukturerte text-objektet (med encodingFormat) direkte i minnet
          article.text = fullModuleData.text || fullModuleData.body || fullModuleData.markdownContent;
        }
      } catch (err) {
        console.error('Lazy loading failed for selected module JSON file:', err);
        article.text = '<p class="error">Kunne ikke laste innhold.</p>';
      }
    }
    
    const targetParams = { id };
    if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
      targetParams.track = this.#state.trackFilter;
    }
    if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;
    
    this.#syncUrl(targetParams, hash);
    this.#filter(false);
    this.#scrollToAnchor(hash || location.hash);
  }

  #closeActive() {
    this.#state.activeId = null;
    const targetParams = {};
    if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
      targetParams.track = this.#state.trackFilter;
    }
    if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;
    
    this.#syncUrl(targetParams);
    this.#filter(false);
  }

  #reset() {
    this.#state.query = '';
    if (this.#refs.searchInput) {
      this.#refs.searchInput.value = '';
      this.#refs.searchInput.classList.remove('active-search');
    }
    this.#state.activeId = null;
    this.#state.tagFilter = null;
    
    const targetParams = {};
    if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
      targetParams.track = this.#state.trackFilter;
    }
    
    this.#syncUrl(targetParams);
    this.#refs.resetBtn?.classList.add('invisible');
    this.#renderGlobalTagCloud();
    this.#filter(true);
  }

  async #copyShareLink(id, btn) {
    try {
      await navigator.clipboard.writeText(CONFIG.shareUrl(id));
      const original = btn.textContent;
      btn.textContent = 'Link copied! ✔';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Clipboard failed:', err);
    }
  }

  #onArticleClick(e) {
    const tagBtn = e.target.closest('.tag-click-btn');
    if (tagBtn) {
      this.#toggleTag(tagBtn.dataset.tag);
      return;
    }

    const artEl = e.target.closest('.filterable');
    const artId = artEl?.dataset.id;
    if (e.target.closest('.article-title-clickable') || e.target.closest('.discipline-badge')) {
      if (artId) this.#selectModule(artId);
      return;
    }

    const nextBtn = e.target.closest('.next-step-btn');
    if (nextBtn) {
      this.#selectModule(nextBtn.dataset.nextId);
      return;
    }

    const shareBtn = e.target.closest('.share-btn');
    if (shareBtn) {
      this.#copyShareLink(shareBtn.dataset.id, shareBtn);
      return;
    }

    const closeBtn = e.target.closest('.close-article-btn');
    if (closeBtn) {
      this.#closeActive();
      return;
    }

    const a = e.target.closest('a[href]');
    if (a) this.#handleInternalLink(a, e);
  }

  #handleInternalLink(a, event) {
    const href = a.getAttribute('href') || '';

    if (href.startsWith('#')) {
      event.preventDefault();
      
      const targetParams = { id: this.#state.activeId };
      if (this.#state.trackFilter && this.#state.trackFilter !== 'all') {
        targetParams.track = this.#state.trackFilter;
      }
      if (this.#state.tagFilter) targetParams.tag = this.#state.tagFilter;
      
      this.#syncUrl(targetParams, href);
      this.#scrollToAnchor(href);
      return;
    }

    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return;
    }

    const id = url.searchParams.get('id');
    const hash = url.hash || '';
    const isSamePage = url.pathname === location.pathname;

    if (isSamePage && id) {
      event.preventDefault();
      this.#selectModule(id, hash);
      return;
    }

    if (url.pathname.endsWith('.json')) {
      event.preventDefault();
      const fileId = url.pathname.split('/').pop().replace(/\.json$/, '');
      this.#selectModule(fileId, hash);
      return;
    }
  }

  #scrollToAnchor(rawHash = '') {
    const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    const expanded = this.#refs.articlesContainer?.querySelector(
      `[data-id="${this.#state.activeId}"]`
    );
    if (!expanded) return;

    if (hash) {
      let target = document.getElementById(hash);
      if (!target && this.#state.activeId) {
        target = document.getElementById(`${this.#state.activeId}--${hash}`);
      }
      if (target && expanded.contains(target)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    expanded.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  #getMarkdownRenderer() {
    if (this.#md) return this.#md;
    const ctor = typeof window.markdownit === 'function' ? window.markdownit : null;
    this.#md = ctor ? ctor({ html: true, linkify: true }) : null;
    return this.#md;
  }

  #escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  #highlight(text, words) {
    if (!words.length || !text) return this.#escapeHtml(text);
    const safeWords = words
      .map((w) => w.replace(/^\./, ''))
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!safeWords.length) return this.#escapeHtml(text);

    const re = new RegExp(`(${safeWords.join('|')})`, 'gi');
    return this.#escapeHtml(text).replace(re, '<mark>$1</mark>');
  }
  #createSearchSnippet(textObj, queryWords) {
    if (!textObj || !queryWords.length) return '';
    
    // Henter ut ren tekst uavhengig av om det er streng eller objekt
    const rawText = typeof textObj === 'object' ? (textObj.text || '') : textObj;
    if (!rawText) return '';

    // Vi fjerner markdown-symboler i søke-snutten så det ser ryddig ut for brukeren
    const cleanText = rawText.replace(/[#*`_\[\]()|]/g, ' ').replace(/\s+/g, ' ');
    const lowerText = cleanText.toLowerCase();
    
    // Finn posisjonen til det første søkeordet
    const firstWord = queryWords[0].replace(/^\./, '');
    const index = lowerText.indexOf(firstWord);
    
    if (index === -1) return ''; // Søkeordet var ikke i brødteksten (kanskje det var i tittel/tags)

    // Bestem start og stopp for utdraget (ca 60 tegn før ordet, 100 tegn etter)
    const start = Math.max(0, index - 60);
    const end = Math.min(cleanText.length, index + 100);
    
    let snippet = cleanText.slice(start, end).trim();
    
    // Legg til prikker (...) hvis vi kuttet midt i teksten
    if (start > 0) snippet = '...' + snippet;
    if (end < cleanText.length) snippet = snippet + '...';
    
    // Returner snutten ferdig highlightet med gult!
    return this.#highlight(snippet, queryWords);
  }

  #syncResetButton() {
    const { searchInput, resetBtn } = this.#refs;
    const hasText = searchInput && searchInput.value.trim().length > 0;
    
    resetBtn?.classList.toggle('invisible', !hasText);
    
    if (searchInput) {
      searchInput.classList.toggle('active-search', hasText);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new KitApp();
  app.init();
});

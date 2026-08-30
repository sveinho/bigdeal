  /**
   * Kit Learning App - Part 4 (Unified Syntax)
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
    
    if (article && !article.text && !article.body && !article.markdownContent && article.url) {
      try {
        const res = await fetch(article.url);
        if (res.ok) {
          const fullModuleData = await res.json();
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

  #createSearchSnippet(textObj, queryWords) {
    if (!textObj || !queryWords.length) return '';
    const rawText = typeof textObj === 'object' ? (textObj.text || '') : textObj;
    if (!rawText) return '';

    const cleanText = rawText.replace(/[#*`_\[\]()|]/g, ' ').replace(/\s+/g, ' ');
    const lowerText = cleanText.toLowerCase();
    
    const firstWord = queryWords || '';
    if (!firstWord) return '';
    
    const index = lowerText.indexOf(firstWord.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - 60);
    const end = Math.min(cleanText.length, index + 100);
    
    let snippet = cleanText.slice(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (cleanText.length > end) snippet = snippet + '...';
    
    return this.#highlight(snippet, queryWords);
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

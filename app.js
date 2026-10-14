(() => {
  const config = window.APP_CONFIG || {};
  const SUPABASE_URL = config.supabaseUrl || "";
  const SUPABASE_ANON_KEY = config.supabaseAnonKey || "";
  const SUPABASE_TABLE = config.supabaseTable || "cards";
  const STORAGE_KEY = "bs-card-browser.deck.v5";
  const MAX_CARD_COPIES = 3;
  const DECK_IMAGE_MANIFEST_KEY = "bs-deck-v1";
  const DECK_QR_PREFIX = "BSD2|";
  const SET_CATEGORY_ORDER = ["本家", "合作", "詩姬", "未分類"];
  const SET_SECTION_ORDER = ["預組", "補充", "其他"];
  const SET_CLASSIFICATION_FALLBACK = {
    "26RBS01": ["本家", "補充"],
    "26RBS02": ["本家", "補充"],
    "26RSD01": ["本家", "預組"],
    "26RSD02": ["本家", "預組"],
    "26RSD03": ["本家", "預組"],
    "26RSD04": ["本家", "預組"],
    "26RSD05": ["本家", "預組"],
    "26RSD06": ["本家", "預組"],
    "26RCB01": ["合作", "補充"],
    "26RSD07": ["合作", "預組"],
    "26RSD08": ["詩姬", "預組"],
    "26RDB01": ["詩姬", "補充"]
  };

  const db =
    SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;  const demoCards = [
    {
      id: "demo-26RBS01-X01",
      set_code: "26RBS01",
      card_number: "26RBS01-X01",
      rarity: "X",
      cost: 5,
      card_name: "赤巫 薔綾提耶兒",
      type: "【戰魂】",
      system: "<紅雲>",
      infix: "",
      suffix: "<光焰>",
      effect: "Lv1-2『召喚時』公開自己的牌組上方3張卡。",
      color: "紅",
      image_url: "https://files.bandai-tcg-plus.com/card_image/BS-JA/RBS2601/26RBS01-X01%2B.png?d=367x0",
      is_active: true
    },
    {
      id: "demo-26RCB01-X01",
      set_code: "26RCB01",
      card_number: "26RCB01-X01",
      rarity: "X",
      cost: 7,
      card_name: "假面騎士EX-AID 無敵玩家",
      type: "【戰魂】",
      system: "<裝甲>",
      infix: "",
      suffix: "<極致>",
      effect: "Lv1-2『召喚時』將對手的戰魂全部破壞。",
      color: "白",
      image_url: "https://files.bandai-tcg-plus.com/card_image/BS-JA/RCB2601/26RCB01-X01%2B.png?d=367x0",
      is_active: true
    }
  ];

  const state = {
    loading: true,
    error: "",
    view: "browse",
    search: "",
    cardSortMode: "default",
    filters: {
      set_code: [],
      type: [],
      system: [],
      infix: [],
      suffix: [],
      color: [],
      rarity: [],
      cost: []
    },
    openFilter: null,
    expandedSetSections: new Set(),
    cards: [],
    cardById: new Map(),
    sets: [],
    deck: loadDeck(),
    authUser: null,
    profile: null,
    selectedCard: null,
    previewOpen: false,
    deckDetailsOpen: false,
    deckImportChooserOpen: false,
    deckPaste: {
      open: false,
      file: null,
      previewUrl: ""
    },
    deckImport: {
      open: false,
      loading: false,
      progress: 0,
      message: "",
      source: "",
      fileName: "",
      recognized: [],
      unknown: []
    },
    deckCollapsed: true,
    adminImportStatus: "",
    visitStats: {
      total: 0,
      today: 0
    }
  };

  const app = document.querySelector("#app");
  if (!app) return;
  let searchRenderTimer = null;
  let isComposingSearch = false;
  let previewPointerDrag = null;

  init().catch((error) => {
    console.error(error);
    state.error = error?.message || "初始化失敗";
    state.loading = false;
    render();
  });

  async function init() {
    bindEvents();
    await syncSession();
    await Promise.all([loadSets(), loadCards(), registerVisit()]);
    state.loading = false;
    render();
  }

  function loadDeck() {
    try {
      const savedDeck = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(savedDeck)
        ? savedDeck.map((item) => ({
            ...item,
            count: Math.min(Number(item.count) || 0, MAX_CARD_COPIES)
          })).filter((item) => item.id && item.count > 0)
        : [];
    } catch {
      return [];
    }
  }

  function saveDeck() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.deck));
  }

  async function syncSession() {
    if (!db) return;
    const { data } = await db.auth.getSession();
    state.authUser = data.session?.user || null;
    state.profile = null;

    if (state.authUser) {
      const { data: profile } = await db.from("profiles").select("*").eq("id", state.authUser.id).maybeSingle();
      state.profile = profile || null;
    }
  }

  async function loadSets() {
    if (!db) {
      state.sets = [];
      return;
    }

    const { data, error } = await db
      .from("sets")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) throw error;
    state.sets = (data || []).map(normalizeSet);
  }

  function normalizeSet(set) {
    const fallback = SET_CLASSIFICATION_FALLBACK[set.code] || ["未分類", "其他"];
    return {
      ...set,
      set_category: normalizeTextBlock(set.set_category || fallback[0]) || "未分類",
      set_section: normalizeTextBlock(set.set_section || fallback[1]) || "其他"
    };
  }

  async function loadCards() {
    try {
      if (!db) throw new Error("Supabase 未設定");

      const { data, error } = await db
        .from(SUPABASE_TABLE)
        .select("*")
        .order("set_code", { ascending: true })
        .order("card_number", { ascending: true });

      if (error) throw error;
      state.cards = (data || []).map(normalizeCard);
      rebuildCardIndex();
      state.error = "";
    } catch (error) {
      console.error(error);
      state.cards = demoCards.map(normalizeCard);
      rebuildCardIndex();
      state.error = "無法連線 Supabase，先顯示示範資料。";
    }
  }

  function rebuildCardIndex() {
    state.cardById = new Map(state.cards.map((card) => [card.id, card]));
  }

  async function registerVisit() {
    if (!db) return;

    try {
      const { data, error } = await db.rpc("register_site_visit");
      if (error) throw error;

      const stats = Array.isArray(data) ? data[0] : data;
      state.visitStats = {
        total: Number(stats?.total_visitors || 0),
        today: Number(stats?.today_visitors || 0)
      };
    } catch (error) {
      console.warn("Visit stats unavailable:", error);
    }
  }

  function normalizeCard(card) {
    return {
      id: String(card.id || card.card_number || ""),
      set_code: String(card.set_code || inferSetCode(card.card_number || "")),
      card_number: String(card.card_number || ""),
      rarity: String(card.rarity || ""),
      cost: Number(card.cost || 0),
      card_name: String(card.card_name || ""),
      type: String(card.type || ""),
      system: String(card.system || ""),
      infix: String(card.infix || ""),
      suffix: String(card.suffix || ""),
      effect: normalizeTextBlock(card.effect || ""),
      color: String(card.color || ""),
      image_url: String(card.image_url || ""),
      is_active: card.is_active !== false
    };
  }

  function inferSetCode(cardNumber) {
    return String(cardNumber || "").split("-")[0] || "";
  }

  function normalizeTextBlock(value) {
    return String(value || "")
      .replaceAll("_x000D_", "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n[ \t]*\n+/g, "\n")
      .trim();
  }

  function isAdmin() {
    return state.profile?.role === "admin";
  }

  function deckTotal() {
    return state.deck.reduce((sum, item) => sum + item.count, 0);
  }

  function countDeckByType(keyword) {
    return state.deck.reduce((sum, item) => {
      const card = state.cardById.get(item.id);
      return sum + (card?.type?.includes(keyword) ? item.count : 0);
    }, 0);
  }

  function getVisibleCards() {
    const query = state.search.trim().toLowerCase();
    const compareCards = createCardComparator(state.cardSortMode);

    return state.cards.filter((card) => {
      if (!matchesFilter("set_code", card.set_code)) return false;
      if (!matchesFilter("type", card.type)) return false;
      if (!matchesAffixFilters(card)) return false;
      if (!matchesFilter("color", card.color)) return false;
      if (!matchesFilter("rarity", card.rarity)) return false;
      if (!matchesFilter("cost", String(card.cost))) return false;
      if (!query) return true;

      return [card.card_number, card.card_name, card.effect, card.type, card.system, card.infix, card.suffix, card.color]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).sort(compareCards);
  }

  function createCardComparator(sortMode = "default") {
    const setOrder = setCodeOptions();
    const selectedSets = state.filters.set_code || [];
    const order = selectedSets.length ? selectedSets : setOrder;
    const orderIndex = new Map(order.map((code, index) => [code, index]));
    const fallbackIndex = new Map(setOrder.map((code, index) => [code, index]));

    return (a, b) => {
      const setA = orderIndex.has(a.set_code) ? orderIndex.get(a.set_code) : fallbackIndex.get(a.set_code);
      const setB = orderIndex.has(b.set_code) ? orderIndex.get(b.set_code) : fallbackIndex.get(b.set_code);
      const normalizedSetA = setA === undefined ? Number.MAX_SAFE_INTEGER : setA;
      const normalizedSetB = setB === undefined ? Number.MAX_SAFE_INTEGER : setB;
      const numberA = parseCardNumberOrder(a.card_number);
      const numberB = parseCardNumberOrder(b.card_number);
      if (sortMode === "cost-asc") {
        const costA = Number.isFinite(Number(a.cost)) ? Number(a.cost) : Number.MAX_SAFE_INTEGER;
        const costB = Number.isFinite(Number(b.cost)) ? Number(b.cost) : Number.MAX_SAFE_INTEGER;
        if (costA !== costB) return costA - costB;
        if (normalizedSetA !== normalizedSetB) return normalizedSetA - normalizedSetB;
        if (numberA.group !== numberB.group) return numberA.group - numberB.group;
        if (numberA.number !== numberB.number) return numberA.number - numberB.number;
        return String(a.card_number || "").localeCompare(String(b.card_number || ""), "zh-Hant");
      }
      if (numberA.group !== numberB.group) return numberA.group - numberB.group;
      if (normalizedSetA !== normalizedSetB) return normalizedSetA - normalizedSetB;
      if (numberA.number !== numberB.number) return numberA.number - numberB.number;
      return String(a.card_number || "").localeCompare(String(b.card_number || ""), "zh-Hant");
    };
  }

  function parseCardNumberOrder(cardNumber) {
    const text = String(cardNumber || "");
    const xMatch = text.match(/-X(\d+)/i);
    if (xMatch) return { group: 0, number: Number(xMatch[1]) || 0 };

    const normalMatch = text.match(/-(\d+)$/);
    if (normalMatch) return { group: 1, number: Number(normalMatch[1]) || 0 };

    return { group: 2, number: Number.MAX_SAFE_INTEGER };
  }

  function matchesFilter(field, value) {
    const selected = state.filters[field] || [];
    return selected.length === 0 || selected.includes(String(value ?? ""));
  }

  function matchesAffixFilters(card, exceptField = "") {
    const cardValues = [String(card.system || ""), String(card.infix || ""), String(card.suffix || "")];
    const systemSelected = exceptField === "system" ? [] : state.filters.system || [];
    const infixSelected = exceptField === "infix" ? [] : state.filters.infix || [];
    const suffixSelected = exceptField === "suffix" ? [] : state.filters.suffix || [];
    const selectedValues = [...systemSelected, ...infixSelected, ...suffixSelected].map((value) => String(value || ""));

    return selectedValues.length === 0 || selectedValues.some((value) => cardValues.includes(value));
  }

  function matchesActiveFilters(card, exceptField = "") {
    const query = state.search.trim().toLowerCase();
    const fields = ["set_code", "type", "system", "infix", "suffix", "color", "rarity", "cost"];

    for (const field of fields) {
      if (field === exceptField) continue;
      if (field === "system" || field === "infix" || field === "suffix") continue;
      const value = field === "cost" ? String(card.cost) : card[field];
      if (!matchesFilter(field, value)) return false;
    }
    if (!matchesAffixFilters(card, exceptField)) return false;

    if (!query) return true;
    return [card.card_number, card.card_name, card.effect, card.type, card.system, card.infix, card.suffix, card.color]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function uniqueValues(field, numeric = false, includeBlank = true) {
    const sourceCards = state.cards.filter((card) => matchesActiveFilters(card, field));
    const values = [...new Set(sourceCards.map((card) => String(card[field] ?? "")).filter((value) => value !== ""))];
    const sorted = values.sort(numeric ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b, "zh-Hant"));
    return includeBlank ? ["", ...sorted] : sorted;
  }

  function orderedValues(field, order) {
    const values = uniqueValues(field, false, false);
    const known = order.filter((value) => values.includes(value));
    const extras = values.filter((value) => !order.includes(value));
    return [...known, ...extras];
  }

  function setCodeOptions() {
    const available = new Set(uniqueValues("set_code", false, false));
    const ordered = state.sets
      .map((set) => set.code)
      .filter((code) => code && available.has(code));
    const extras = [...available].filter((code) => !ordered.includes(code)).sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return [...ordered, ...extras];
  }

  function setFilterGroups(setCodes) {
    const setByCode = new Map(state.sets.map((set) => [set.code, set]));
    const groups = new Map();

    for (const code of setCodes) {
      const set = normalizeSet(setByCode.get(code) || { code });
      const category = set.set_category || "未分類";
      const section = set.set_section || "其他";
      if (!groups.has(category)) groups.set(category, new Map());
      const sections = groups.get(category);
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(code);
    }

    const orderedNames = (names, preferred) => [
      ...preferred.filter((name) => names.includes(name)),
      ...names.filter((name) => !preferred.includes(name)).sort((a, b) => a.localeCompare(b, "zh-Hant"))
    ];

    return orderedNames([...groups.keys()], SET_CATEGORY_ORDER).map((category) => {
      const sections = groups.get(category);
      return {
        category,
        sections: orderedNames([...sections.keys()], SET_SECTION_ORDER).map((section) => ({
          section,
          codes: [...sections.get(section)].sort(compareSetCodes)
        }))
      };
    });
  }

  function compareSetCodes(a, b) {
    return String(a).localeCompare(String(b), "en", {
      numeric: true,
      sensitivity: "base"
    });
  }

  function render() {
    const visibleCards = getVisibleCards();
    const setCodes = setCodeOptions();

    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="brand-badge">BS</div>
            <h1>BS中文｜Battle Spirits 卡牌中文化(標準)</h1>
          </div>
          <div class="toolbar">
            <button class="button source-button shop-button" data-action="open-external" data-url="https://myship.7-11.com.tw/general/detail/GM2609065930585">單卡販售</button>
            <button class="button source-button" data-action="open-external" data-url="https://www.bandai-tcg-plus.com/deck_build?default_regulation=224&game_title_id=7&playable_regulation[]=224&selected_game_format=224">圖面來源:BANDAI TCG+</button>
            <button class="button source-button dark" data-action="open-external" data-url="https://www.facebook.com/profile.php?id=61585394820761">翻譯來源: 橘子的tcg翻譯花盆</button>
            <span class="status ${db ? "ok" : "warn"}">${db ? "已連線 Supabase" : "未設定 Supabase"}</span>
            <button class="button" data-action="switch-view" data-view="browse">瀏覽</button>
            <button class="button" data-action="switch-view" data-view="admin">${isAdmin() ? "後台" : "管理檢視"}</button>
            <button class="button" data-action="auth">${state.authUser ? "登出" : "登入"}</button>
          </div>
        </header>

        <main class="main ${state.view === "admin" ? "admin-main" : ""} ${state.deckCollapsed ? "deck-collapsed" : ""}">
          <section class="catalog">
            <div class="catalog-body">
              ${state.view === "admin" ? "" : `
                <section class="filters">
                  <div class="filter-search">
                    <input id="searchInput" class="search" placeholder="搜尋卡號、名稱、效果..." value="${escapeHtml(state.search)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
                  </div>
                  <div class="filter-controls">
                    ${sortDropdownHtml()}
                    ${setCodeFilterHtml(setCodes)}
                    ${filterDropdownHtml("color", "顏色", orderedValues("color", ["紅", "紫", "綠", "白", "黃", "藍"]))}
                    ${filterDropdownHtml("type", "種類", orderedValues("type", ["【戰魂】", "【核心】", "【魔法】"]))}
                    ${filterDropdownHtml("system", "前綴", uniqueValues("system", false, false))}
                    ${filterDropdownHtml("infix", "中綴", uniqueValues("infix", false, false))}
                    ${filterDropdownHtml("suffix", "後綴", uniqueValues("suffix", false, false))}
                    ${filterDropdownHtml("rarity", "稀有度", orderedValues("rarity", ["X", "M", "R", "C"]))}
                    ${filterDropdownHtml("cost", "費用", uniqueValues("cost", true, false))}
                    <button class="filter-button reset-filter-btn" data-action="reset-filters" type="button"><span aria-hidden="true">↻</span>重置</button>
                  </div>
                </section>
              `}
              ${state.error ? `<div class="notice">${escapeHtml(state.error)}</div>` : ""}
              ${state.view === "admin" ? renderAdminPanel() : renderCatalog(visibleCards)}
            </div>
          </section>
          ${state.view === "admin" ? "" : `<aside class="deck ${state.deckCollapsed ? "is-hidden" : ""}">
            <div class="deck-head">
              <div class="deck-title">牌組 <span class="count-badge">${deckTotal()}</span></div>
              <div class="deck-head-actions">
                <button class="button deck-import-btn" data-action="choose-deck-image" title="從牌組圖片匯入">匯入</button>
                <button class="button danger ghost" data-action="deck-clear">清空</button>
                <button class="button icon-button deck-collapse-btn" data-action="toggle-deck" aria-label="切換牌組顯示"></button>
                <input id="deckImageInput" class="visually-hidden" type="file" accept="image/png,.png" />
              </div>
            </div>
            <div class="deck-summary">
              <div class="summary-box">戰魂<strong>${countDeckByType("戰魂")}</strong></div>
              <div class="summary-box">核心<strong>${countDeckByType("核心")}</strong></div>
              <div class="summary-box">魔法<strong>${countDeckByType("魔法")}</strong></div>
            </div>
            <div class="deck-list">${renderDeckList()}</div>
            <div class="deck-view-actions">
              <button class="button deck-view-btn" data-action="open-deck-details">牌組詳情</button>
              <button class="button primary deck-view-btn" data-action="open-preview">牌組預覽</button>
            </div>
          </aside>
          ${state.deckCollapsed ? `<button class="deck-rail" data-action="toggle-deck" aria-label="展開牌組"><span aria-hidden="true"></span><strong>(${deckTotal()})</strong></button>` : ""}`}
        </main>
      </div>
      ${state.view === "admin" ? "" : `<button class="back-to-top ${state.deckCollapsed ? "" : "is-deck-open"}" data-action="scroll-top" aria-label="回到最上面"></button>`}
      ${renderDeckDetails()}
      ${renderModal()}
      ${renderPreview()}
      ${renderDeckImportChooser()}
      ${renderDeckPasteModal()}
      ${renderDeckImportModal()}
    `;
  }

  function renderPreservingScroll() {
    const scroller = document.querySelector(".catalog-body");
    const deckScroller = document.querySelector(".deck-list");
    const previewScroller = document.querySelector(".preview-modal, .deck-details-modal");
    const filterMenuScroll = new Map(
      [...document.querySelectorAll("[data-filter-menu]")].map((menu) => [
        menu.getAttribute("data-filter-menu"),
        { left: menu.scrollLeft, top: menu.scrollTop }
      ])
    );
    const scrollX = scroller?.scrollLeft ?? window.scrollX;
    const scrollY = scroller?.scrollTop ?? window.scrollY;
    const deckScrollX = deckScroller?.scrollLeft ?? 0;
    const deckScrollY = deckScroller?.scrollTop ?? 0;
    const previewScrollX = previewScroller?.scrollLeft ?? 0;
    const previewScrollY = previewScroller?.scrollTop ?? 0;
    render();
    const nextScroller = document.querySelector(".catalog-body");
    const nextDeckScroller = document.querySelector(".deck-list");
    const nextPreviewScroller = document.querySelector(".preview-modal, .deck-details-modal");
    if (nextScroller) nextScroller.scrollTo(scrollX, scrollY);
    else window.scrollTo(scrollX, scrollY);
    nextDeckScroller?.scrollTo(deckScrollX, deckScrollY);
    nextPreviewScroller?.scrollTo(previewScrollX, previewScrollY);
    filterMenuScroll.forEach((position, field) => {
      const nextMenu = document.querySelector(`[data-filter-menu="${CSS.escape(field)}"]`);
      nextMenu?.scrollTo(position.left, position.top);
    });
  }

  function scheduleSearchRender() {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(() => {
      if (isComposingSearch) return;
      renderPreservingScroll();
      const searchInput = document.querySelector("#searchInput");
      if (searchInput instanceof HTMLInputElement) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }, 250);
  }

  function renderCatalog(cards) {
    if (state.loading) return `<div class="empty">資料載入中...</div>`;
    if (!cards.length) return `<div class="empty">沒有符合條件的卡片</div>`;
    return `<div class="card-grid">${cards.map(renderCard).join("")}</div>`;
  }

  function renderCard(card) {
    const colorClass = cardColorClass(card.color);
    return `
      <article class="card ${colorClass}">
        <img class="card-image" src="${escapeHtml(card.image_url)}" alt="${escapeHtml(card.card_name)}" loading="lazy" />
        <div class="card-body">
          <div class="card-topline">
            <div class="card-number">${escapeHtml(card.card_number)}</div>
          </div>
          <h3>${escapeHtml(card.card_name)}</h3>
          <div class="tags">${pill(card.type, "type")}${pill(card.system, "prefix")}${pill(card.infix, "infix")}${pill(card.suffix, "suffix")}</div>
          <p class="effect">${escapeHtml(card.effect || "")}</p>
          <div class="card-actions">
            <button class="button primary" data-action="add-card" data-id="${escapeHtml(card.id)}">+ 加到牌組</button>
            <button class="button" data-action="view-card" data-id="${escapeHtml(card.id)}">查看詳情</button>
          </div>
        </div>
      </article>
    `;
  }

  function cardColorClass(color) {
    const normalized = String(color || "").trim();
    const map = {
      紅: "card-color-red",
      紫: "card-color-purple",
      綠: "card-color-green",
      白: "card-color-white",
      黃: "card-color-yellow",
      藍: "card-color-blue",
      赤: "card-color-red",
      red: "card-color-red",
      purple: "card-color-purple",
      green: "card-color-green",
      white: "card-color-white",
      yellow: "card-color-yellow",
      blue: "card-color-blue"
    };

    return map[normalized] || map[normalized.toLowerCase()] || "card-color-default";
  }

  function renderAdminPanel() {
    if (!isAdmin()) {
      return `<div class="empty">目前帳號不是管理員，請先登入管理帳號。</div>`;
    }

    const setRows = state.sets.length
      ? state.sets
          .map(
            (set, index) => `
              <tr class="set-row" draggable="true" data-set-index="${index}">
                <td>${escapeHtml(set.code || "")}</td>
                <td>${escapeHtml(set.name || "")}</td>
                <td>${escapeHtml(set.set_category || "未分類")}</td>
                <td>${escapeHtml(set.set_section || "其他")}</td>
                <td>${set.sort_order ?? 0}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="5">沒有卡包資料</td></tr>`;

    return `
      <div class="admin-grid">
        <section class="panel">
          <div class="panel-head">
            <h3>卡包清單</h3>
            <button class="button" data-action="reload-sets">重新整理</button>
          </div>
          <div class="admin-table-scroll">
            <table class="admin-table">
              <thead><tr><th>Code</th><th>Name</th><th>大分類</th><th>小分類</th><th>Sort</th></tr></thead>
              <tbody>${setRows}</tbody>
            </table>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h3>卡片管理</h3>
          </div>
          <div class="visit-stats">
            <div class="visit-stat">
              <span>總瀏覽人數</span>
              <strong>${state.visitStats.total}</strong>
            </div>
            <div class="visit-stat">
              <span>當日人數</span>
              <strong>${state.visitStats.today}</strong>
            </div>
          </div>
          <div class="muted">這裡先保留管理後台框架，下一步可以補新增、編輯、刪除表單。</div>
          <div class="admin-import">
            <label class="button import-file-btn">
              選擇 Excel 並同步
              <input id="importExcelInput" type="file" accept=".xlsx,.xls" />
            </label>
            <div class="muted">${escapeHtml(state.adminImportStatus || "支援有表頭或固定欄位順序的 Excel；相同 Code 或 Name 會保留原本排序，新卡包才排到最後。")}</div>
          </div>
        </section>
      </div>
    `;
  }

  function renderDeckList() {
    if (!state.deck.length) return `<div class="empty small">尚未加入卡片</div>`;

    return state.deck
      .map((item, index) => {
        const card = state.cardById.get(item.id);
        return `
          <div class="deck-item" draggable="true" data-deck-index="${index}">
            <div>
              <div class="deck-item-code">${escapeHtml(card?.card_number || item.id)}</div>
              <div class="deck-item-name">${escapeHtml(card?.card_name || item.id)}</div>
            </div>
            <div class="deck-item-controls">
              <button class="mini" data-action="dec-deck" data-id="${escapeHtml(item.id)}">-</button>
              <span>${item.count}</span>
              <button class="mini" data-action="inc-deck" data-id="${escapeHtml(item.id)}">+</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderModal() {
    if (!state.selectedCard) return "";
    const card = state.selectedCard;

    return `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-grid">
            <img src="${escapeHtml(card.image_url)}" alt="${escapeHtml(card.card_name)}" />
            <div class="modal-detail">
              <div class="section-head">
                <h2>${escapeHtml(card.card_number)}</h2>
                <button class="button modal-close-btn" data-action="close-modal" aria-label="關閉">×</button>
              </div>
              <h3>${escapeHtml(card.card_name)}</h3>
              <div class="tags">${pill(card.type, "type")}${pill(card.system, "prefix")}${pill(card.infix, "infix")}${pill(card.suffix, "suffix")}</div>
              <p class="effect modal-effect">${escapeHtml(card.effect || "")}</p>
              <button class="button primary modal-add-btn" data-action="add-card" data-id="${escapeHtml(card.id)}">+ 加到牌組</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDeckDetails() {
    if (!state.deckDetailsOpen) return "";

    const items = state.deck
      .map((item) => {
        const card = state.cardById.get(item.id);
        if (!card) return "";

        return `
          <article
            class="card deck-detail-card ${cardColorClass(card.color)}"
          >
            <button
              class="deck-detail-image-button"
              data-action="view-card"
              data-id="${escapeHtml(card.id)}"
              title="查看卡片詳情"
              aria-label="查看 ${escapeHtml(card.card_name)} 詳情"
            >
              <img class="card-image" src="${escapeHtml(card.image_url)}" alt="${escapeHtml(card.card_name)}" loading="lazy" />
            </button>
            <div class="card-body">
              <div class="card-topline">
                <div class="card-number">${escapeHtml(card.card_number)}</div>
                <div class="deck-detail-controls" aria-label="${escapeHtml(card.card_name)} 張數">
                  <button class="mini" data-action="dec-deck" data-id="${escapeHtml(item.id)}">-</button>
                  <span>${item.count}</span>
                  <button class="mini" data-action="inc-deck" data-id="${escapeHtml(item.id)}">+</button>
                </div>
              </div>
              <h3>${escapeHtml(card.card_name)}</h3>
              <div class="tags">${pill(card.type, "type")}${pill(card.system, "prefix")}${pill(card.infix, "infix")}${pill(card.suffix, "suffix")}</div>
              <p class="effect">${escapeHtml(card.effect || "")}</p>
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <div class="modal-backdrop">
        <div class="modal deck-details-modal" role="dialog" aria-modal="true" aria-labelledby="deckDetailsTitle">
          <div class="section-head deck-details-head">
            <div class="deck-details-heading">
              <h2 id="deckDetailsTitle">目前牌組詳情</h2>
              <div class="deck-details-total"><span>[</span><strong>${deckTotal()}</strong><span>]</span></div>
              <div class="deck-details-summary">
                <span>戰魂<strong>${countDeckByType("戰魂")}</strong></span>
                <span>核心<strong>${countDeckByType("核心")}</strong></span>
                <span>魔法<strong>${countDeckByType("魔法")}</strong></span>
              </div>
            </div>
            <button class="button modal-close-btn" data-action="close-deck-details" aria-label="關閉">X</button>
          </div>
          <div class="card-grid deck-details-grid">${items || `<div class="empty small">尚未加入卡片</div>`}</div>
        </div>
      </div>
    `;
  }

  function renderPreview() {
    if (!state.previewOpen) return "";

    const items = state.deck
      .map((item, index) => {
        const card = state.cardById.get(item.id);
        if (!card) return "";

        return `
          <div class="preview-item" data-deck-index="${index}" title="拖曳卡片可調整順序">
            <img src="${escapeHtml(card.image_url)}" alt="${escapeHtml(card.card_name)}" draggable="false" />
            <div class="preview-count">x${item.count}</div>
            <div class="preview-code">${escapeHtml(card.card_number)}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="modal-backdrop">
        <div class="modal preview-modal">
          <div class="section-head">
            <h2>目前牌組預覽</h2>
            <div class="preview-actions">
              <button class="button" data-action="open-preview-image">匯出牌組</button>
              <button class="button" data-action="close-preview">關閉</button>
            </div>
          </div>
          <div class="preview-grid">${items || `<div class="empty small">尚未加入卡片</div>`}</div>
        </div>
      </div>
    `;
  }

  function renderDeckImportModal() {
    const importState = state.deckImport;
    if (!importState.open) return "";

    const recognizedRows = importState.recognized
      .map(({ card, count, confidence }) => `
        <div class="deck-import-row">
          <img src="${escapeHtml(card.image_url)}" alt="" loading="lazy" />
          <div class="deck-import-card">
            <strong>${escapeHtml(card.card_number)}</strong>
            <span>${escapeHtml(card.card_name)}</span>
          </div>
          <span class="deck-import-confidence">${confidence === "estimated" ? "請確認" : "已確認"}</span>
          <strong class="deck-import-count">x${count}</strong>
        </div>
      `)
      .join("");

    const unknownRows = importState.unknown
      .map((value) => `<span class="deck-import-unknown">${escapeHtml(value)}</span>`)
      .join("");
    const importTotal = importState.recognized.reduce(
      (total, { count }) => total + clampDeckCount(count),
      0
    );
    const progress = Math.max(0, Math.min(100, Math.round(importState.progress * 100)));

    return `
      <div class="modal-backdrop deck-import-backdrop">
        <div class="modal deck-import-modal" role="dialog" aria-modal="true" aria-labelledby="deckImportTitle">
          <div class="section-head">
            <div>
              <h2 id="deckImportTitle">從圖片匯入牌組</h2>
              <div class="deck-import-file">${escapeHtml(importState.fileName)}</div>
            </div>
            <button class="button modal-close-btn" data-action="close-deck-import" aria-label="關閉" ${importState.loading ? "disabled" : ""}>X</button>
          </div>
          ${importState.loading ? `
            <div class="deck-import-loading">
              <strong>${escapeHtml(importState.message || "正在讀取圖片...")}</strong>
              <div class="deck-import-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
                <span style="width:${progress}%"></span>
              </div>
              <span>${progress}%</span>
            </div>
          ` : `
            <div class="deck-import-summary">
              <span>辨識方式<strong>${escapeHtml(importState.source || "無")}</strong></span>
              <span>總張數<strong>${importTotal}</strong></span>
              <span>無法辨識<strong>${importState.unknown.length}</strong></span>
            </div>
            <p class="deck-import-message">${escapeHtml(importState.message)}</p>
            <div class="deck-import-results">${recognizedRows || `<div class="empty small">沒有可匯入的卡片</div>`}</div>
            ${unknownRows ? `<div class="deck-import-warning"><strong>未找到卡片：</strong>${unknownRows}</div>` : ""}
            <div class="deck-import-actions">
              <button class="button danger deck-import-replace" data-action="apply-deck-import" ${recognizedRows ? "" : "disabled"}>取代目前牌組</button>
              <button class="button deck-import-cancel" data-action="close-deck-import">取消</button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderDeckImportChooser() {
    if (!state.deckImportChooserOpen) return "";
    return `
      <div class="modal-backdrop deck-import-backdrop">
        <div class="modal deck-import-choice-modal" role="dialog" aria-modal="true" aria-labelledby="deckImportChoiceTitle">
          <div class="section-head">
            <h2 id="deckImportChoiceTitle">匯入牌組圖片</h2>
            <button class="button modal-close-btn" data-action="close-deck-import-chooser" aria-label="關閉">X</button>
          </div>
          <div class="deck-import-choice-actions">
            <button class="button primary" data-action="paste-deck-image">貼上圖片</button>
            <button class="button" data-action="open-deck-image-file">開啟檔案</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDeckPasteModal() {
    if (!state.deckPaste.open) return "";
    const hasImage = Boolean(state.deckPaste.file && state.deckPaste.previewUrl);
    return `
      <div class="modal-backdrop deck-import-backdrop">
        <div class="modal deck-paste-modal" role="dialog" aria-modal="true" aria-labelledby="deckPasteTitle">
          <div class="section-head">
            <h2 id="deckPasteTitle">貼上牌組圖片</h2>
            <button class="button modal-close-btn" data-action="close-deck-paste" aria-label="關閉">X</button>
          </div>
          <div class="deck-paste-zone ${hasImage ? "has-image" : ""}" tabindex="0" data-paste-zone>
            ${hasImage
              ? `<img src="${state.deckPaste.previewUrl}" alt="已貼上的牌組圖片縮圖" />`
              : `<strong>貼上牌組圖片</strong>
                 <span>按下按鈕或使用 Ctrl+V，貼上後會先顯示縮圖。</span>
                 <button class="button primary deck-clipboard-button" data-action="read-deck-clipboard">貼上圖片</button>`}
          </div>
          <div class="deck-paste-actions">
            ${hasImage ? `<button class="button" data-action="reset-deck-paste">重新貼上</button>` : ""}
            <button class="button" data-action="close-deck-paste">取消</button>
            ${hasImage ? `<button class="button primary" data-action="confirm-deck-paste">確認匯入</button>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function openDeckPasteModal() {
    state.deckImportChooserOpen = false;
    state.deckPaste = { open: true, file: null, previewUrl: "" };
    renderPreservingScroll();
    requestAnimationFrame(() => document.querySelector("[data-paste-zone]")?.focus());
  }

  function closeDeckPasteModal() {
    state.deckPaste = { open: false, file: null, previewUrl: "" };
  }

  async function setPastedImagePreview(blob) {
    const extension = blob.type.split("/")[1] || "png";
    const file = new File([blob], `pasted-image.${extension}`, { type: blob.type });
    const previewUrl = await fileToDataUrl(file);
    state.deckPaste = { open: true, file, previewUrl };
    renderPreservingScroll();
    requestAnimationFrame(() => document.querySelector("[data-paste-zone]")?.focus());
  }

  async function readDeckImageFromClipboard() {
    if (!navigator.clipboard?.read) {
      alert("目前瀏覽器不支援按鈕讀取剪貼簿，請使用 Ctrl+V 貼上圖片。");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        await setPastedImagePreview(await item.getType(imageType));
        return;
      }
      alert("剪貼簿中沒有圖片，請先複製牌組圖片後再按貼上圖片。");
    } catch (error) {
      console.error(error);
      alert("無法讀取剪貼簿圖片，請允許剪貼簿權限，或使用 Ctrl+V 貼上。");
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("圖片預覽失敗"));
      reader.readAsDataURL(file);
    });
  }

  async function handleDeckImageImport(file) {
    state.deckImportChooserOpen = false;
    closeDeckPasteModal();
    state.previewOpen = false;
    state.deckDetailsOpen = false;
    state.deckImport = {
      open: true,
      loading: true,
      progress: 0.02,
      message: "正在讀取圖片...",
      source: "",
      fileName: file.name || "剪貼簿圖片",
      recognized: [],
      unknown: []
    };
    renderPreservingScroll();

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const manifestText = file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
        ? extractPngTextChunk(bytes, DECK_IMAGE_MANIFEST_KEY)
        : "";

      if (manifestText) {
        const manifest = JSON.parse(manifestText);
        const version = Number(manifest.v);
        const isSupportedExport = version === 1 || (version === 2 && manifest.app === "BattleSpiritszh-TW");
        if (!Array.isArray(manifest.deck) || !isSupportedExport) {
          throw new Error("本站牌組資料格式不正確");
        }
        const result = mapImportedEntries(manifest.deck, "exact");
        state.deckImport.source = "本站匯出資料";
        state.deckImport.recognized = result.recognized;
        state.deckImport.unknown = result.unknown;
        state.deckImport.message = "已讀取本站寫入圖片的完整牌組資料，請確認後再匯入。";
      } else {
        const qrEntries = await extractDeckEntriesFromQr(file);
        if (qrEntries.length) {
          const result = mapImportedEntries(qrEntries, "exact");
          state.deckImport.source = "本站 QR 牌組資料";
          state.deckImport.recognized = result.recognized;
          state.deckImport.unknown = result.unknown;
          state.deckImport.message = "圖片的隱藏資料已被移除，已改由本站 QR 完整還原牌組。";
        } else {
          state.deckImport.source = "非本站匯出圖片";
          state.deckImport.recognized = [];
          state.deckImport.unknown = [];
          state.deckImport.message = "此圖片沒有本站牌組資料或本站 QR，無法匯入。請使用新版網站重新產生牌組圖片。";
        }
      }
    } catch (error) {
      console.error(error);
      state.deckImport.source = "讀取失敗";
      state.deckImport.recognized = [];
      state.deckImport.unknown = [];
      state.deckImport.message = `無法讀取這張圖片：${error?.message || "未知錯誤"}`;
    } finally {
      state.deckImport.loading = false;
      state.deckImport.progress = 1;
      renderPreservingScroll();
    }
  }

  function mapImportedEntries(entries, confidence) {
    const recognized = [];
    const unknown = [];
    const byId = new Map();

    entries.forEach((entry) => {
      const rawNumber = entry?.n ?? entry?.card_number ?? entry?.number ?? "";
      const card = findCardByNumber(rawNumber);
      if (!card) {
        if (rawNumber) unknown.push(String(rawNumber));
        return;
      }

      const count = clampDeckCount(entry?.c ?? entry?.count ?? 1);
      const existing = byId.get(card.id);
      if (existing) existing.count = Math.min(MAX_CARD_COPIES, existing.count + count);
      else {
        const item = { card, count, confidence };
        byId.set(card.id, item);
        recognized.push(item);
      }
    });

    return { recognized, unknown: [...new Set(unknown)] };
  }

  function applyDeckImport() {
    const imported = state.deckImport.recognized.map(({ card, count }) => ({
      id: card.id,
      count: clampDeckCount(count)
    }));
    if (!imported.length) return;

    if (state.deck.length && !confirm("確定要用圖片內容取代目前牌組嗎？")) return;
    state.deck = imported;

    saveDeck();
    state.deckImport.open = false;
    renderPreservingScroll();
  }

  function clampDeckCount(value) {
    return Math.max(1, Math.min(MAX_CARD_COPIES, Number.parseInt(value, 10) || 1));
  }

  function normalizeCardNumber(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[‐‑–—]/g, "-")
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9-]/g, "");
  }

  function findCardByNumber(value) {
    const normalized = normalizeCardNumber(value);
    return state.cards.find((card) => normalizeCardNumber(card.card_number) === normalized) || null;
  }

  function buildDeckQrPayload(items) {
    const entries = items.map(({ card, count }) => `${normalizeCardNumber(card.card_number)}*${clampDeckCount(count)}`);
    return `${DECK_QR_PREFIX}${entries.join(",")}`;
  }

  function parseDeckQrPayload(value) {
    const text = String(value || "").trim();
    if (!text.startsWith(DECK_QR_PREFIX)) return [];
    return text
      .slice(DECK_QR_PREFIX.length)
      .split(",")
      .map((entry) => {
        const match = entry.match(/^([A-Z0-9-]+)\*([1-3])$/);
        return match ? { n: match[1], c: Number(match[2]) } : null;
      })
      .filter(Boolean);
  }

  async function extractDeckEntriesFromQr(file) {
    if (typeof window.jsQR !== "function") throw new Error("QR 讀取元件未載入");
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close?.();
      return [];
    }

    const attempts = [
      { topRatio: 0, scale: 1 },
      { topRatio: 0.5, scale: 1 },
      { topRatio: 0, scale: 0.75 },
      { topRatio: 0.35, scale: 0.75 },
      { topRatio: 0.5, scale: 0.5 }
    ];

    try {
      for (const attempt of attempts) {
        const sourceY = Math.floor(bitmap.height * attempt.topRatio);
        const sourceHeight = bitmap.height - sourceY;
        canvas.width = Math.max(1, Math.round(bitmap.width * attempt.scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * attempt.scale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          bitmap,
          0,
          sourceY,
          bitmap.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth"
        });
        const entries = parseDeckQrPayload(result?.data);
        if (entries.length) return entries;
      }
      return [];
    } finally {
      bitmap.close?.();
    }
  }

  function createDeckQr(payload, size) {
    if (typeof window.qrcode !== "function") throw new Error("QR 產生元件未載入");
    const qr = window.qrcode(0, "L");
    qr.addData(payload);
    qr.make();

    const modules = qr.getModuleCount();
    const quietModules = 4;
    const cellSize = Math.max(2, Math.floor(size / (modules + quietModules * 2)));
    const actualSize = cellSize * (modules + quietModules * 2);
    return { qr, modules, quietModules, cellSize, actualSize };
  }

  function drawDeckQr(ctx, qrData, canvasWidth, top) {
    const { qr, modules, quietModules, cellSize, actualSize } = qrData;
    const x = Math.round((canvasWidth - actualSize) / 2);

    ctx.fillStyle = "#fff";
    ctx.fillRect(x, top, actualSize, actualSize);
    ctx.fillStyle = "#000";
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (!qr.isDark(row, col)) continue;
        ctx.fillRect(
          x + (col + quietModules) * cellSize,
          top + (row + quietModules) * cellSize,
          cellSize,
          cellSize
        );
      }
    }
    return actualSize;
  }

  async function openPreviewImage() {
    const popup = window.open("", "_blank");
    if (!popup) return;

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>牌組預覽圖片</title>
          <style>
            body {
              margin: 0;
              background: #020617;
              color: #e5e7eb;
              font: 700 18px "Noto Sans TC", sans-serif;
            }
            .preview-image-toolbar {
              position: sticky;
              top: 0;
              z-index: 2;
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 10px 14px;
              background: rgba(2, 6, 23, 0.92);
              border-bottom: 1px solid rgba(148, 163, 184, 0.2);
            }
            .preview-image-button {
              border: 1px solid rgba(148, 163, 184, 0.35);
              border-radius: 8px;
              background: #1d4ed8;
              color: #fff;
              padding: 8px 12px;
              font: inherit;
              text-decoration: none;
              cursor: pointer;
            }
            #copyPreviewStatus {
              color: #93c5fd;
              font-size: 14px;
            }
            .preview-image-stage {
              min-height: calc(100vh - 58px);
              display: grid;
              place-items: start center;
              padding: 24px;
            }
            img, svg { max-width: 100%; height: auto; display: block; }
          </style>
        </head>
        <body>圖片產生中...</body>
      </html>
    `);
    popup.document.close();

    const items = state.deck
      .map((item) => {
        const card = state.cardById.get(item.id);
        return card ? { card, count: item.count } : null;
      })
      .filter(Boolean);

    if (!items.length) {
      popup.document.body.textContent = "尚未加入卡片";
      return;
    }

    const columns = 6;
    const cardWidth = 180;
    const cardHeight = Math.round(cardWidth * 88 / 63);
    const codeHeight = 30;
    const gap = 20;
    const padding = 24;
    const qrPayload = buildDeckQrPayload(items);
    const qrData = createDeckQr(qrPayload, 240);
    const qrTopPadding = 14;
    const qrTextGap = 16;
    const qrTextHeight = 20;
    const qrBottomPadding = 10;
    const qrFooterHeight = qrTopPadding + qrData.actualSize + qrTextGap + qrTextHeight + qrBottomPadding;
    const rows = Math.ceil(items.length / columns);
    const width = padding * 2 + columns * cardWidth + (columns - 1) * gap;
    const cardAreaHeight = padding * 2 + rows * (cardHeight + codeHeight) + (rows - 1) * gap;
    const height = cardAreaHeight + qrFooterHeight;
    const canvas = document.createElement("canvas");
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const manifestData = {
      v: 2,
      app: "BattleSpiritszh-TW",
      deck: items.map(({ card, count }) => ({ n: card.card_number, c: clampDeckCount(count) }))
    };

    try {
      await Promise.all(items.map(async ({ card, count }, index) => {
        const image = await loadImage(card.image_url);
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + col * (cardWidth + gap);
        const y = padding + row * (cardHeight + codeHeight + gap);

        ctx.drawImage(image, x, y, cardWidth, cardHeight);
        drawCountBadge(ctx, x + cardWidth - 30, y + 30, count);
        ctx.fillStyle = "#93c5fd";
        ctx.font = "700 18px 'Noto Sans TC', sans-serif";
        ctx.fillText(card.card_number || "", x + cardWidth / 2, y + cardHeight + 20);
      }));

      ctx.fillStyle = "rgba(148, 163, 184, 0.28)";
      ctx.fillRect(padding, cardAreaHeight, width - padding * 2, 1);
      const qrTop = cardAreaHeight + qrTopPadding;
      const actualQrSize = drawDeckQr(ctx, qrData, width, qrTop);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "700 16px 'Noto Sans TC', sans-serif";
      ctx.fillText(
        "BS中文牌組資料|可複製圖片後貼回網站做匯入",
        width / 2,
        qrTop + actualQrSize + qrTextGap + qrTextHeight / 2
      );

      const pngBlob = await canvasToBlob(canvas);
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const manifest = JSON.stringify(manifestData);
      const imageUrl = await bytesToDataUrl(
        embedPngTextChunk(pngBytes, DECK_IMAGE_MANIFEST_KEY, manifest),
        "image/png"
      );
      renderPreviewImagePage(popup, `<img src="${imageUrl}" alt="牌組預覽圖片" />`, imageUrl, "png");
    } catch (error) {
      popup.document.body.textContent = "PNG 產生失敗，卡圖代理讀取失敗。";
      console.error(error);
    }
  }

  function renderPreviewImagePage(popup, contentHtml, dataUrl) {
    const filename = "bs-deck-preview.png";
    popup.document.body.innerHTML = `
      <div class="preview-image-toolbar">
        <a class="preview-image-button" href="${dataUrl}" download="${filename}">下載圖片</a>
        <button class="preview-image-button" id="copyPreviewImage" type="button">複製圖片</button>
        <span id="copyPreviewStatus"></span>
      </div>
      <main class="preview-image-stage">${contentHtml}</main>
    `;

    const copyButton = popup.document.querySelector("#copyPreviewImage");
    const status = popup.document.querySelector("#copyPreviewStatus");
    copyButton?.addEventListener("click", async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await popup.navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        if (status) status.textContent = "已複製圖片";
      } catch (error) {
        if (status) status.textContent = "複製失敗，請改用下載";
        console.error(error);
      }
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG 轉換失敗"));
      }, "image/png");
    });
  }

  function bytesToDataUrl(bytes, mimeType) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("圖片資料轉換失敗"));
      reader.readAsDataURL(new Blob([bytes], { type: mimeType }));
    });
  }

  function embedPngTextChunk(pngBytes, keyword, value) {
    if (!isPng(pngBytes)) throw new Error("不是有效的 PNG 圖片");
    const keywordBytes = new TextEncoder().encode(keyword);
    const valueBytes = new TextEncoder().encode(value);
    const chunkData = new Uint8Array(keywordBytes.length + 1 + valueBytes.length);
    chunkData.set(keywordBytes, 0);
    chunkData.set(valueBytes, keywordBytes.length + 1);
    const textChunk = buildPngChunk("tEXt", chunkData);

    let offset = 8;
    while (offset + 12 <= pngBytes.length) {
      const length = readUint32(pngBytes, offset);
      const type = readAscii(pngBytes, offset + 4, 4);
      if (type === "IEND") {
        const output = new Uint8Array(pngBytes.length + textChunk.length);
        output.set(pngBytes.slice(0, offset), 0);
        output.set(textChunk, offset);
        output.set(pngBytes.slice(offset), offset + textChunk.length);
        return output;
      }
      offset += length + 12;
    }
    throw new Error("PNG 結構不完整");
  }

  function extractPngTextChunk(pngBytes, keyword) {
    if (!isPng(pngBytes)) return "";
    let offset = 8;
    while (offset + 12 <= pngBytes.length) {
      const length = readUint32(pngBytes, offset);
      const type = readAscii(pngBytes, offset + 4, 4);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > pngBytes.length) return "";
      if (type === "tEXt") {
        const chunkData = pngBytes.slice(dataStart, dataEnd);
        const separator = chunkData.indexOf(0);
        if (separator > 0 && readAscii(chunkData, 0, separator) === keyword) {
          return new TextDecoder().decode(chunkData.slice(separator + 1));
        }
      }
      if (type === "IEND") break;
      offset += length + 12;
    }
    return "";
  }

  function isPng(bytes) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }

  function buildPngChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const output = new Uint8Array(data.length + 12);
    writeUint32(output, 0, data.length);
    output.set(typeBytes, 4);
    output.set(data, 8);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, typeBytes.length);
    writeUint32(output, output.length - 4, crc32(crcInput));
    return output;
  }

  function readUint32(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
  }

  function writeUint32(bytes, offset, value) {
    new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0, false);
  }

  function readAscii(bytes, offset, length) {
    let result = "";
    for (let index = offset; index < offset + length; index += 1) result += String.fromCharCode(bytes[index]);
    return result;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function loadImage(src) {
    const sources = imageSourceCandidates(src);
    return sources.reduce(
      (promise, source) => promise.catch(() => loadImageSource(source)),
      Promise.reject()
    );
  }

  function loadImageSource(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const testCanvas = document.createElement("canvas");
          testCanvas.width = 1;
          testCanvas.height = 1;
          const testCtx = testCanvas.getContext("2d");
          testCtx?.drawImage(image, 0, 0, 1, 1);
          testCanvas.toDataURL("image/png");
          resolve(image);
        } catch {
          reject(new Error("Image source taints canvas"));
        }
      };
      image.onerror = reject;
      image.src = src;
    });
  }

  function imageSourceCandidates(src) {
    const url = String(src || "");
    const withoutHttps = url.replace(/^https:\/\//, "ssl:");

    return [
      url,
      `https://wsrv.nl/?url=${encodeURIComponent(withoutHttps)}&output=png`,
      `https://images.weserv.nl/?url=${encodeURIComponent(withoutHttps)}&output=png`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];
  }

  function drawCountBadge(ctx, x, y, count) {
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 22px 'Noto Sans TC', sans-serif";
    ctx.fillText(`x${count}`, x, y + 1);
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (!target && event.target instanceof Element && !event.target.closest(".filter-dropdown")) {
        if (state.openFilter) {
          state.openFilter = null;
          renderPreservingScroll();
        }
        return;
      }
      if (!(target instanceof HTMLElement)) return;

      const action = target.dataset.action;

      if (action === "switch-view") {
        state.view = target.dataset.view || "browse";
        render();
      } else if (action === "toggle-filter") {
        const field = target.dataset.filter || "";
        state.openFilter = state.openFilter === field ? null : field;
        renderPreservingScroll();
      } else if (action === "toggle-set-section") {
        const key = target.dataset.setSectionKey || "";
        if (state.expandedSetSections.has(key)) state.expandedSetSections.delete(key);
        else state.expandedSetSections.add(key);
        state.openFilter = "set_code";
        renderPreservingScroll();
      } else if (action === "set-card-sort") {
        state.cardSortMode = target.dataset.sortMode === "cost-asc" ? "cost-asc" : "default";
        state.openFilter = null;
        renderPreservingScroll();
      } else if (action === "auth") {
        if (state.authUser) {
          await db?.auth.signOut();
          state.authUser = null;
          state.profile = null;
          render();
        } else {
          await openLoginPrompt();
        }
      } else if (action === "reset-filters") {
        resetFilters();
        renderPreservingScroll();
      } else if (action === "scroll-top") {
        document.querySelector(".catalog-body")?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (action === "toggle-deck") {
        state.deckCollapsed = !state.deckCollapsed;
        renderPreservingScroll();
      } else if (action === "open-preview") {
        state.deckDetailsOpen = false;
        state.previewOpen = true;
        renderPreservingScroll();
      } else if (action === "open-deck-details") {
        state.previewOpen = false;
        state.deckDetailsOpen = true;
        renderPreservingScroll();
      } else if (action === "open-preview-image") {
        await openPreviewImage();
      } else if (action === "choose-deck-image") {
        state.deckImportChooserOpen = true;
        renderPreservingScroll();
      } else if (action === "paste-deck-image") {
        openDeckPasteModal();
      } else if (action === "read-deck-clipboard") {
        await readDeckImageFromClipboard();
      } else if (action === "open-deck-image-file") {
        document.querySelector("#deckImageInput")?.click();
      } else if (action === "close-deck-import-chooser") {
        state.deckImportChooserOpen = false;
        renderPreservingScroll();
      } else if (action === "close-deck-paste") {
        closeDeckPasteModal();
        renderPreservingScroll();
      } else if (action === "reset-deck-paste") {
        state.deckPaste = { open: true, file: null, previewUrl: "" };
        renderPreservingScroll();
        requestAnimationFrame(() => document.querySelector("[data-paste-zone]")?.focus());
      } else if (action === "confirm-deck-paste") {
        const file = state.deckPaste.file;
        if (file) await handleDeckImageImport(file);
      } else if (action === "close-deck-import") {
        state.deckImport.open = false;
        renderPreservingScroll();
      } else if (action === "apply-deck-import") {
        applyDeckImport();
      } else if (action === "open-external") {
        const url = target.dataset.url || "";
        if (url && confirm("是否連線到外部網站？")) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } else if (action === "close-preview" || action === "close-modal") {
        state.previewOpen = false;
        state.selectedCard = null;
        renderPreservingScroll();
      } else if (action === "close-deck-details") {
        state.deckDetailsOpen = false;
        renderPreservingScroll();
      } else if (action === "export-deck") {
        exportDeck();
      } else if (action === "clear-deck" || action === "deck-clear") {
        if (confirm("確定要清空牌組嗎？")) {
          state.deck = [];
          saveDeck();
          renderPreservingScroll();
        }
      } else if (action === "reload-cards") {
        await loadCards();
        render();
      } else if (action === "reload-sets") {
        await loadSets();
        render();
      } else if (action === "view-card") {
        state.selectedCard = state.cardById.get(target.dataset.id || "") || null;
        renderPreservingScroll();
      } else if (action === "add-card" || action === "inc-deck") {
        addToDeck(target.dataset.id || "");
      } else if (action === "dec-deck") {
        removeFromDeck(target.dataset.id || "");
      }
    });

    document.addEventListener("change", async (event) => {
      const target = event.target;

      if (target instanceof HTMLSelectElement && target.id in state.filters) {
        state.filters[target.id] = target.value;
        renderPreservingScroll();
        return;
      }

      if (target instanceof HTMLInputElement && target.type === "checkbox" && target.dataset.filterField) {
        const field = target.dataset.filterField;
        const value = target.value;
        const selected = new Set(state.filters[field] || []);

        if (target.checked) selected.add(value);
        else selected.delete(value);

        state.filters[field] = [...selected];
        state.openFilter = field;
        renderPreservingScroll();
        return;
      }

      if (target instanceof HTMLInputElement && target.id === "deckImageInput" && target.files?.[0]) {
        const file = target.files[0];
        target.value = "";
        state.deckImportChooserOpen = false;
        await handleDeckImageImport(file);
        return;
      }

      if (target instanceof HTMLInputElement && target.id === "importExcelInput" && target.files?.[0]) {
        try {
          await importExcelToSupabase(target.files[0]);
        } catch (error) {
          console.error(error);
          state.adminImportStatus = `匯入失敗：${formatImportError(error)}`;
          renderPreservingScroll();
        } finally {
          target.value = "";
        }
      }
    });

    document.addEventListener("paste", async (event) => {
      if (!state.deckPaste.open) return;
      const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
      const blob = imageItem?.getAsFile();
      if (!blob) return;
      event.preventDefault();
      await setPastedImagePreview(blob);
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.id === "searchInput") {
        state.search = target.value;
        if (!isComposingSearch) scheduleSearchRender();
      }
    });

    document.addEventListener("compositionstart", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.id === "searchInput") {
        isComposingSearch = true;
        window.clearTimeout(searchRenderTimer);
      }
    });

    document.addEventListener("compositionend", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.id === "searchInput") {
        isComposingSearch = false;
        state.search = event.target.value;
        scheduleSearchRender();
      }
    });

    document.addEventListener("dragstart", (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .preview-item, .set-row") : null;
      if (!(item instanceof HTMLElement)) return;

      const type = item.classList.contains("set-row") ? "set" : "deck";
      const index = type === "set" ? item.dataset.setIndex : item.dataset.deckIndex;
      if (index === undefined) return;

      event.dataTransfer?.setData("text/plain", index);
      event.dataTransfer?.setData("application/x-sort-type", type);
      event.dataTransfer?.setDragImage(item, 20, 20);
      item.classList.add("is-dragging");
    });

    document.addEventListener("dragover", (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .preview-item, .set-row") : null;
      if (!(item instanceof HTMLElement)) return;
      if (item.dataset.deckIndex === undefined && item.dataset.setIndex === undefined) return;
      event.preventDefault();
      item.classList.add("is-drag-over");
    });

    document.addEventListener("dragleave", (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .preview-item, .set-row") : null;
      item?.classList.remove("is-drag-over");
    });

    document.addEventListener("drop", async (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .preview-item, .set-row") : null;
      if (!(item instanceof HTMLElement)) return;

      event.preventDefault();
      const fromIndex = Number(event.dataTransfer?.getData("text/plain"));
      const type = event.dataTransfer?.getData("application/x-sort-type");
      item.classList.remove("is-drag-over");

      if (type === "set" && item.dataset.setIndex !== undefined) {
        await reorderSets(fromIndex, Number(item.dataset.setIndex));
      } else if (type === "deck" && item.dataset.deckIndex !== undefined) {
        reorderDeck(fromIndex, Number(item.dataset.deckIndex));
      }
    });

    document.addEventListener("dragend", () => {
      document.querySelectorAll(".deck-item.is-dragging, .deck-item.is-drag-over, .preview-item.is-dragging, .preview-item.is-drag-over, .set-row.is-dragging, .set-row.is-drag-over").forEach((item) => {
        item.classList.remove("is-dragging", "is-drag-over");
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const image = event.target instanceof Element ? event.target.closest(".preview-item img") : null;
      const item = image?.closest(".preview-item");
      if (!(item instanceof HTMLElement)) return;

      const fromIndex = Number(item.dataset.deckIndex);
      if (!Number.isInteger(fromIndex)) return;

      event.preventDefault();
      const imageRect = image.getBoundingClientRect();
      const dragImage = image.cloneNode(true);
      dragImage.className = "preview-drag-image";
      dragImage.setAttribute("aria-hidden", "true");
      dragImage.style.width = `${imageRect.width}px`;
      dragImage.style.height = `${imageRect.height}px`;
      dragImage.style.left = `${event.clientX}px`;
      dragImage.style.top = `${event.clientY}px`;
      document.body.appendChild(dragImage);

      previewPointerDrag = {
        pointerId: event.pointerId,
        fromIndex,
        toIndex: fromIndex,
        item,
        dragImage
      };
      item.setPointerCapture?.(event.pointerId);
      item.classList.add("is-dragging");
    });

    document.addEventListener("pointermove", (event) => {
      if (!previewPointerDrag || previewPointerDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      previewPointerDrag.dragImage.style.left = `${event.clientX}px`;
      previewPointerDrag.dragImage.style.top = `${event.clientY}px`;

      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const target = hovered?.closest(".preview-item");
      if (!(target instanceof HTMLElement)) return;

      const toIndex = Number(target.dataset.deckIndex);
      if (!Number.isInteger(toIndex)) return;

      document.querySelectorAll(".preview-item.is-drag-over").forEach((item) => item.classList.remove("is-drag-over"));
      target.classList.add("is-drag-over");
      previewPointerDrag.toIndex = toIndex;
    });

    const finishPreviewPointerDrag = (event, cancelled = false) => {
      if (!previewPointerDrag || previewPointerDrag.pointerId !== event.pointerId) return;

      const { fromIndex, toIndex, item, dragImage } = previewPointerDrag;
      previewPointerDrag = null;
      if (item.hasPointerCapture?.(event.pointerId)) item.releasePointerCapture(event.pointerId);
      dragImage.remove();
      document.querySelectorAll(".preview-item.is-dragging, .preview-item.is-drag-over").forEach((element) => {
        element.classList.remove("is-dragging", "is-drag-over");
      });

      if (!cancelled) reorderDeck(fromIndex, toIndex);
    };

    document.addEventListener("pointerup", (event) => finishPreviewPointerDrag(event));
    document.addEventListener("pointercancel", (event) => finishPreviewPointerDrag(event, true));
  }

  function resetFilters() {
    state.search = "";
    state.cardSortMode = "default";
    state.filters = {
      set_code: [],
      type: [],
      system: [],
      infix: [],
      suffix: [],
      color: [],
      rarity: [],
      cost: []
    };
    state.openFilter = null;
  }

  async function importExcelToSupabase(file) {
    if (!db) throw new Error("Supabase 未設定");
    if (!isAdmin()) throw new Error("目前登入帳號不是 admin，無法寫入 Supabase");
    if (!window.XLSX) throw new Error("Excel 解析工具尚未載入，請確認網路可連到 cdn.jsdelivr.net");

    state.adminImportStatus = `正在讀取 ${file.name}...`;
    renderPreservingScroll();

    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const cards = readCardsFromWorkbook(workbook);
    if (!cards.length) throw new Error("Excel 內沒有可匯入的卡片資料");

    state.adminImportStatus = `讀取到 ${cards.length} 張卡片，正在同步 Supabase...`;
    renderPreservingScroll();

    const importedSetCodes = await upsertSetsFromCards(cards);
    await upsertCards(cards);
    await deleteObsoleteCards(cards);
    await deleteObsoleteSets(importedSetCodes);
    await Promise.all([loadSets(), loadCards()]);

    state.adminImportStatus = `已同步 ${cards.length} 張卡片到 Supabase。`;
    renderPreservingScroll();
  }

  function formatImportError(error) {
    const message = error?.message || "未知錯誤";
    if (message.includes("infix")) {
      return "Supabase 尚未建立中綴欄位。請先在 SQL Editor 執行 infix-migration.sql，再重新匯入。";
    }
    if (message.includes("set_category") || message.includes("set_section")) {
      return "Supabase 尚未建立卡包分類欄位。請先在 SQL Editor 執行 set-classification-migration.sql，再重新匯入。";
    }
    if (message.includes("row-level security")) {
      return "Supabase RLS 擋住寫入。請確認目前登入帳號在 profiles 表 role='admin'，並在 Supabase SQL Editor 重跑 supabase.sql 內的 cards/sets admin policy。";
    }
    return message;
  }

  function readCardsFromWorkbook(workbook) {
    const cards = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      if (!rows.length) continue;

      const header = rows[0].map(normalizeTextBlock);
      const colIndex = Object.fromEntries(header.map((name, index) => [name, index]).filter(([name]) => name));
      const hasHeader = "CardNumber" in colIndex && "CardName" in colIndex;
      const dataRows = hasHeader ? rows.slice(1) : rows;

      for (const row of dataRows) {
        const card = hasHeader
          ? excelCardFromHeaderRow(row, colIndex, sheetName)
          : excelCardFromPlainRow(row, sheetName);
        if (card.card_number && card.card_name) cards.push(card);
      }
    }

    return [...new Map(cards.map((card) => [card.card_number, card])).values()];
  }

  function excelCardFromHeaderRow(row, colIndex, sheetName) {
    const value = (name) => normalizeTextBlock(row[colIndex[name]] ?? "");
    return buildImportCard({
      card_number: value("CardNumber"),
      rarity: value("Rarity"),
      cost: toInt(row[colIndex.Cost]),
      card_name: value("CardName"),
      type: value("Type"),
      system: value("System"),
      infix: value("Infix"),
      suffix: value("Suffix"),
      effect: value("Effect"),
      color: value("Color"),
      image_url: value("ImageUrl"),
      set_name: value("SetName") || value("set_name"),
      set_category: value("set_category"),
      set_section: value("set_section"),
      sheetName
    });
  }

  function excelCardFromPlainRow(row, sheetName) {
    return buildImportCard({
      card_number: normalizeTextBlock(row[0] ?? ""),
      rarity: normalizeTextBlock(row[1] ?? ""),
      cost: toInt(row[2]),
      card_name: normalizeTextBlock(row[3] ?? ""),
      type: normalizeTextBlock(row[4] ?? ""),
      system: normalizeTextBlock(row[5] ?? ""),
      infix: normalizeTextBlock(row[6] ?? ""),
      suffix: normalizeTextBlock(row[7] ?? ""),
      effect: normalizeTextBlock(row[8] ?? ""),
      color: normalizeTextBlock(row[9] ?? ""),
      image_url: normalizeTextBlock(row[10] ?? ""),
      set_category: normalizeTextBlock(row[11] ?? ""),
      set_section: normalizeTextBlock(row[12] ?? ""),
      set_name: normalizeTextBlock(row[13] ?? ""),
      sheetName
    });
  }

  function buildImportCard(card) {
    return {
      set_code: card.sheetName || "",
      card_number: card.card_number,
      rarity: card.rarity,
      cost: card.cost,
      card_name: card.card_name,
      type: card.type,
      system: card.system,
      infix: card.infix,
      suffix: card.suffix,
      effect: card.effect,
      color: card.color,
      image_url: card.image_url,
      _set_name: card.set_name || "",
      _set_category: card.set_category || "",
      _set_section: card.set_section || "",
      source: "bandai",
      is_active: true
    };
  }

  function toInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  async function upsertSetsFromCards(cards) {
    const importedSets = new Map();
    for (const card of cards) {
      if (!card.set_code || importedSets.has(card.set_code)) continue;
      importedSets.set(card.set_code, {
        set_name: card._set_name || "",
        set_category: card._set_category || "",
        set_section: card._set_section || ""
      });
    }

    const setCodes = [...importedSets.keys()];
    const { data: latestSets, error: setsError } = await db.from("sets").select("*");
    if (setsError) throw setsError;

    const existingSets = (latestSets || []).map(normalizeSet);
    const existingByCode = new Map(existingSets.map((set) => [set.code, set]));
    const existingByName = uniqueSetsByName(existingSets);
    let nextSortOrder = existingSets.reduce((max, set) => Math.max(max, Number(set.sort_order) || 0), 0) + 1;
    const payload = setCodes.map((code) => {
      const classification = importedSets.get(code);
      const importedName = classification.set_name || `Battle Spirits ${code}`;
      const existing = existingByCode.get(code) || existingByName.get(normalizeSetName(importedName));
      return {
        code,
        name: classification.set_name || existing?.name || `Battle Spirits ${code}`,
        sort_order: existing ? Number(existing.sort_order) || 0 : nextSortOrder++,
        set_category: classification.set_category || existing?.set_category || "未分類",
        set_section: classification.set_section || existing?.set_section || "其他"
      };
    });

    if (!payload.length) return [];
    const { error } = await db.from("sets").upsert(payload, { onConflict: "code" });
    if (error) throw error;
    return setCodes;
  }

  async function upsertCards(cards) {
    const batchSize = 200;
    for (let index = 0; index < cards.length; index += batchSize) {
      const batch = cards.slice(index, index + batchSize).map(({ _set_name, _set_category, _set_section, ...card }) => card);
      const { error } = await db.from(SUPABASE_TABLE).upsert(batch, { onConflict: "card_number" });
      if (error) throw error;
    }
  }

  function normalizeSetName(value) {
    return normalizeTextBlock(value).toLocaleLowerCase("zh-Hant");
  }

  function uniqueSetsByName(sets) {
    const matches = new Map();
    const duplicates = new Set();

    for (const set of sets) {
      const name = normalizeSetName(set.name);
      if (!name) continue;
      if (matches.has(name)) duplicates.add(name);
      else matches.set(name, set);
    }

    for (const name of duplicates) matches.delete(name);
    return matches;
  }

  async function deleteObsoleteCards(cards) {
    const importedCardNumbers = cards.map((card) => card.card_number).filter(Boolean);
    if (!importedCardNumbers.length) return;

    const { data, error } = await db.from(SUPABASE_TABLE).select("card_number");
    if (error) throw error;

    const obsoleteCardNumbers = (data || [])
      .map((card) => card.card_number)
      .filter((cardNumber) => cardNumber && !importedCardNumbers.includes(cardNumber));

    if (!obsoleteCardNumbers.length) return;

    const batchSize = 200;
    for (let index = 0; index < obsoleteCardNumbers.length; index += batchSize) {
      const batch = obsoleteCardNumbers.slice(index, index + batchSize);
      const { error: deleteError } = await db.from(SUPABASE_TABLE).delete().in("card_number", batch);
      if (deleteError) throw deleteError;
    }
  }

  async function deleteObsoleteSets(importedSetCodes) {
    if (!importedSetCodes.length) return;

    const { data, error } = await db.from("sets").select("code");
    if (error) throw error;

    const obsoleteCodes = (data || [])
      .map((set) => set.code)
      .filter((code) => code && !importedSetCodes.includes(code));

    if (!obsoleteCodes.length) return;

    const { error: deleteError } = await db.from("sets").delete().in("code", obsoleteCodes);
    if (deleteError) throw deleteError;
  }

  async function reorderSets(fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.sets.length || toIndex >= state.sets.length) return;

    const nextSets = [...state.sets];
    const [set] = nextSets.splice(fromIndex, 1);
    nextSets.splice(toIndex, 0, set);

    for (const [index, set] of nextSets.entries()) {
      const { error } = await db.from("sets").update({ sort_order: index + 1 }).eq("id", set.id);
      if (error) {
        state.adminImportStatus = `調整順序失敗：${error.message}`;
        renderPreservingScroll();
        return;
      }
    }

    state.sets = nextSets.map((set, index) => ({ ...set, sort_order: index + 1 }));
    renderPreservingScroll();
  }

  function addToDeck(id) {
    if (!id) return;
    const item = state.deck.find((entry) => entry.id === id);

    if (item) {
      if (item.count >= MAX_CARD_COPIES) return;
      item.count += 1;
    }
    else state.deck.push({ id, count: 1 });

    saveDeck();
    renderPreservingScroll();
  }

  function reorderDeck(fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.deck.length || toIndex >= state.deck.length) return;

    const nextDeck = [...state.deck];
    const [item] = nextDeck.splice(fromIndex, 1);
    nextDeck.splice(toIndex, 0, item);
    state.deck = nextDeck;
    saveDeck();
    renderPreservingScroll();
  }

  function removeFromDeck(id) {
    const item = state.deck.find((entry) => entry.id === id);
    if (!item) return;

    item.count -= 1;
    state.deck = state.deck.filter((entry) => entry.count > 0);
    saveDeck();
    renderPreservingScroll();
  }

  function exportDeck() {
    const rows = state.deck.map((item) => {
      const card = state.cardById.get(item.id);
      return `${card?.card_number || item.id}\t${card?.card_name || ""}\t${item.count}`;
    });

    const blob = new Blob([rows.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "bs-deck.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openLoginPrompt() {
    if (!db) {
      alert("目前沒有載入 Supabase 設定");
      return;
    }

    const email = prompt("請輸入管理員 Email");
    if (!email) return;

    const password = prompt("請輸入密碼");
    if (!password) return;

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      alert(error.message);
      return;
    }

    await syncSession();
    render();
  }

  function selectHtml(id, label, values) {
    return `
      <select id="${id}" class="select">
        ${values
          .map((value) => {
            const text = value || label;
            const selected = state.filters[id] === value ? "selected" : "";
            return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(text)}</option>`;
          })
          .join("")}
      </select>
    `;
  }

  function sortDropdownHtml() {
    const options = [
      { value: "default", label: "1.原本排序" },
      { value: "cost-asc", label: "2.費用小到大" }
    ]
      .map(
        ({ value, label }) => `
          <button
            class="sort-option ${state.cardSortMode === value ? "is-selected" : ""}"
            data-action="set-card-sort"
            data-sort-mode="${value}"
            type="button"
          >
            <span class="sort-option-mark" aria-hidden="true">${state.cardSortMode === value ? "✓" : ""}</span>
            <span>${label}</span>
          </button>
        `
      )
      .join("");

    return `
      <div class="filter-dropdown filter-dropdown-sort">
        <button class="filter-button ${state.cardSortMode !== "default" ? "active" : ""}" data-action="toggle-filter" data-filter="sort" type="button">
          <span>${state.cardSortMode === "cost-asc" ? "排序2" : "排序1"}</span>
          <span class="chevron"></span>
        </button>
        ${state.openFilter === "sort" ? `<div class="filter-menu sort-menu">${options}</div>` : ""}
      </div>
    `;
  }

  function filterDropdownHtml(id, label, values) {
    const selected = state.filters[id] || [];
    const active = selected.length > 0;
    const buttonLabel = active ? `${label} (${selected.length})` : label;
    const options = values.length
      ? values
          .map((value) => {
            const checked = selected.includes(String(value)) ? "checked" : "";
            return `
              <label class="filter-option">
                <input type="checkbox" data-filter-field="${escapeHtml(id)}" value="${escapeHtml(value)}" ${checked} />
                <span>${escapeHtml(value)}</span>
              </label>
            `;
          })
          .join("")
      : `<div class="filter-empty">沒有選項</div>`;

    return `
      <div class="filter-dropdown filter-dropdown-${escapeHtml(id)}">
        <button class="filter-button ${active ? "active" : ""}" data-action="toggle-filter" data-filter="${escapeHtml(id)}" type="button">
          <span>${escapeHtml(buttonLabel)}</span>
          <span class="chevron"></span>
        </button>
        ${
          state.openFilter === id
            ? `<div class="filter-menu" data-filter-menu="${escapeHtml(id)}">${options}</div>`
            : ""
        }
      </div>
    `;
  }

  function setCodeFilterHtml(setCodes) {
    const selected = state.filters.set_code || [];
    const active = selected.length > 0;
    const buttonLabel = active ? `編號 (${selected.length})` : "編號";
    const groups = setFilterGroups(setCodes);
    const content = groups.length
      ? groups.map(({ category, sections }) => `
          <section class="set-filter-category">
            <div class="set-filter-category-title">${escapeHtml(category)}</div>
            ${sections.map(({ section, codes }) => {
              const key = `${category}::${section}`;
              const expanded = state.expandedSetSections.has(key);
              const selectedCount = codes.filter((code) => selected.includes(code)).length;
              return `
                <div class="set-filter-section">
                  <button
                    class="set-filter-section-toggle"
                    data-action="toggle-set-section"
                    data-set-section-key="${escapeHtml(key)}"
                    type="button"
                    aria-expanded="${expanded}"
                  >
                    <span>${escapeHtml(section)}${selectedCount ? ` (${selectedCount})` : ""}</span>
                    <strong aria-hidden="true">${expanded ? "−" : "+"}</strong>
                  </button>
                  ${expanded ? `<div class="set-filter-options">
                    ${codes.map((code) => `
                      <label class="filter-option set-filter-option">
                        <input type="checkbox" data-filter-field="set_code" value="${escapeHtml(code)}" ${selected.includes(code) ? "checked" : ""} />
                        <span>${escapeHtml(code)}</span>
                      </label>
                    `).join("")}
                  </div>` : ""}
                </div>
              `;
            }).join("")}
          </section>
        `).join("")
      : `<div class="filter-empty">沒有選項</div>`;

    return `
      <div class="filter-dropdown filter-dropdown-set_code">
        <button class="filter-button ${active ? "active" : ""}" data-action="toggle-filter" data-filter="set_code" type="button">
          <span>${escapeHtml(buttonLabel)}</span>
          <span class="chevron"></span>
        </button>
        ${state.openFilter === "set_code"
          ? `<div class="filter-menu set-filter-menu" data-filter-menu="set_code">${content}</div>`
          : ""}
      </div>
    `;
  }

  function pill(text, variant = "") {
    if (!text) return "";
    return `<span class="tag ${variant ? `tag-${escapeHtml(variant)}` : ""}">${escapeHtml(text)}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();




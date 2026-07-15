(() => {
  const config = window.APP_CONFIG || {};
  const SUPABASE_URL = config.supabaseUrl || "";
  const SUPABASE_ANON_KEY = config.supabaseAnonKey || "";
  const SUPABASE_TABLE = config.supabaseTable || "cards";
  const STORAGE_KEY = "bs-card-browser.deck.v5";
  const VISITOR_STORAGE_KEY = "bs-card-browser.visitor-id.v1";
  const MAX_CARD_COPIES = 3;

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
    filters: {
      set_code: [],
      type: [],
      system: [],
      suffix: [],
      color: [],
      rarity: [],
      cost: []
    },
    openFilter: null,
    cards: [],
    cardById: new Map(),
    sets: [],
    deck: loadDeck(),
    authUser: null,
    profile: null,
    selectedCard: null,
    previewOpen: false,
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
    state.sets = data || [];
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
    sortDeckByCardOrder();
  }

  function sortDeckByCardOrder() {
    if (!state.deck.length || !state.cardById.size) return;

    const compareCards = createCardComparator();
    state.deck = [...state.deck].sort((a, b) => {
      const cardA = state.cardById.get(a.id);
      const cardB = state.cardById.get(b.id);
      if (cardA && cardB) return compareCards(cardA, cardB);
      if (cardA) return -1;
      if (cardB) return 1;
      return String(a.id).localeCompare(String(b.id), "zh-Hant", { numeric: true });
    });
  }

  async function registerVisit() {
    if (!db) return;

    try {
      const visitorId = getVisitorId();
      const { data, error } = await db.rpc("register_site_visit", { p_visitor_id: visitorId });
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

  function getVisitorId() {
    let visitorId = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!visitorId) {
      visitorId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
    }
    return visitorId;
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
    const compareCards = createCardComparator();

    return state.cards.filter((card) => {
      if (!matchesFilter("set_code", card.set_code)) return false;
      if (!matchesFilter("type", card.type)) return false;
      if (!matchesPrefixSuffixFilters(card)) return false;
      if (!matchesFilter("color", card.color)) return false;
      if (!matchesFilter("rarity", card.rarity)) return false;
      if (!matchesFilter("cost", String(card.cost))) return false;
      if (!query) return true;

      return [card.card_number, card.card_name, card.effect, card.type, card.system, card.suffix, card.color]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).sort(compareCards);
  }

  function createCardComparator() {
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
    return selected.length === 0 || selected.includes(String(value || ""));
  }

  function matchesPrefixSuffixFilters(card, exceptField = "") {
    const cardValues = [String(card.system || ""), String(card.suffix || "")];
    const systemSelected = exceptField === "system" ? [] : state.filters.system || [];
    const suffixSelected = exceptField === "suffix" ? [] : state.filters.suffix || [];

    return [...systemSelected, ...suffixSelected].every((value) => cardValues.includes(String(value || "")));
  }

  function matchesActiveFilters(card, exceptField = "") {
    const query = state.search.trim().toLowerCase();
    const fields = ["set_code", "type", "system", "suffix", "color", "rarity", "cost"];

    for (const field of fields) {
      if (field === exceptField) continue;
      if (field === "system" || field === "suffix") continue;
      const value = field === "cost" ? String(card.cost) : card[field];
      if (!matchesFilter(field, value)) return false;
    }
    if (!matchesPrefixSuffixFilters(card, exceptField)) return false;

    if (!query) return true;
    return [card.card_number, card.card_name, card.effect, card.type, card.system, card.suffix, card.color]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function uniqueValues(field, numeric = false, includeBlank = true) {
    const sourceCards = state.cards.filter((card) => matchesActiveFilters(card, field));
    const values = [...new Set(sourceCards.map((card) => String(card[field] || "")).filter(Boolean))];
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

  function render() {
    const visibleCards = getVisibleCards();
    const setCodes = setCodeOptions();

    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="brand-badge">BS</div>
            <div>
              <div>Battle Spirits 卡牌中文化(標準)</div>
            </div>
          </div>
          <div class="toolbar">
            <button class="button source-button" data-action="open-external" data-url="https://www.bandai-tcg-plus.com/deck_build?default_regulation=224&game_title_id=7&playable_regulation[]=224&selected_game_format=224">圖面來源:BANDAI TCG+ ↗</button>
            <button class="button source-button dark" data-action="open-external" data-url="https://www.facebook.com/profile.php?id=61585394820761">翻譯來源: 橘子的tcg翻譯花盆 ↗</button>
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
                    ${filterDropdownHtml("set_code", "編號", setCodes)}
                    ${filterDropdownHtml("color", "顏色", orderedValues("color", ["紅", "紫", "綠", "白", "黃", "藍"]))}
                    ${filterDropdownHtml("type", "種類", orderedValues("type", ["【戰魂】", "【核心】", "【魔法】"]))}
                    ${filterDropdownHtml("system", "前綴", uniqueValues("system", false, false))}
                    ${filterDropdownHtml("suffix", "後綴", uniqueValues("suffix", false, false))}
                    ${filterDropdownHtml("rarity", "稀有度", orderedValues("rarity", ["X", "M", "R", "C"]))}
                    ${filterDropdownHtml("cost", "費用", uniqueValues("cost", true, false))}
                    <button class="button ghost reset-filter-btn" data-action="reset-filters"><span aria-hidden="true">↻</span>重置</button>
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
                <button class="button danger ghost" data-action="deck-clear">清空</button>
                <button class="button icon-button deck-collapse-btn" data-action="toggle-deck" aria-label="切換牌組顯示"></button>
              </div>
            </div>
            <div class="deck-summary">
              <div class="summary-box">戰魂<strong>${countDeckByType("戰魂")}</strong></div>
              <div class="summary-box">核心<strong>${countDeckByType("核心")}</strong></div>
              <div class="summary-box">魔法<strong>${countDeckByType("魔法")}</strong></div>
            </div>
            <div class="deck-list">${renderDeckList()}</div>
            <button class="button primary deck-preview-btn" data-action="open-preview">預覽牌組</button>
          </aside>
          ${state.deckCollapsed ? `<button class="deck-rail" data-action="toggle-deck" aria-label="展開牌組"><span aria-hidden="true"></span><strong>(${deckTotal()})</strong></button>` : ""}`}
        </main>
      </div>
      ${state.view === "admin" ? "" : `<button class="back-to-top ${state.deckCollapsed ? "" : "is-deck-open"}" data-action="scroll-top" aria-label="回到最上面"></button>`}
      ${renderModal()}
      ${renderPreview()}
    `;
  }

  function renderPreservingScroll() {
    const scroller = document.querySelector(".catalog-body");
    const scrollX = scroller?.scrollLeft ?? window.scrollX;
    const scrollY = scroller?.scrollTop ?? window.scrollY;
    render();
    const nextScroller = document.querySelector(".catalog-body");
    if (nextScroller) nextScroller.scrollTo(scrollX, scrollY);
    else window.scrollTo(scrollX, scrollY);
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
          <div class="tags">${pill(card.type, "type")}${pill(card.system, "prefix")}${pill(card.suffix, "suffix")}</div>
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
                <td>${set.sort_order ?? 0}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="3">沒有卡包資料</td></tr>`;

    return `
      <div class="admin-grid">
        <section class="panel">
          <div class="panel-head">
            <h3>卡包清單</h3>
            <button class="button" data-action="reload-sets">重新整理</button>
          </div>
          <div class="admin-table-scroll">
            <table class="admin-table">
              <thead><tr><th>Code</th><th>Name</th><th>Sort</th></tr></thead>
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
            <div class="muted">${escapeHtml(state.adminImportStatus || "支援有表頭或固定欄位順序的 Excel，會 upsert 到 Supabase。")}</div>
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
              <div class="tags">${pill(card.type, "type")}${pill(card.system, "prefix")}${pill(card.suffix, "suffix")}</div>
              <p class="effect modal-effect">${escapeHtml(card.effect || "")}</p>
              <button class="button primary modal-add-btn" data-action="add-card" data-id="${escapeHtml(card.id)}">+ 加到牌組</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPreview() {
    if (!state.previewOpen) return "";

    const items = state.deck
      .map((item) => {
        const card = state.cardById.get(item.id);
        if (!card) return "";

        return `
          <div class="preview-item">
            <img src="${escapeHtml(card.image_url)}" alt="${escapeHtml(card.card_name)}" />
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
              <button class="button" data-action="open-preview-image">開啟圖片</button>
              <button class="button" data-action="close-preview">關閉</button>
            </div>
          </div>
          <div class="preview-grid">${items || `<div class="empty small">尚未加入卡片</div>`}</div>
        </div>
      </div>
    `;
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
    const rows = Math.ceil(items.length / columns);
    const width = padding * 2 + columns * cardWidth + (columns - 1) * gap;
    const height = padding * 2 + rows * (cardHeight + codeHeight) + (rows - 1) * gap;
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

      const imageUrl = canvas.toDataURL("image/png");
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
        state.previewOpen = true;
        renderPreservingScroll();
      } else if (action === "open-preview-image") {
        await openPreviewImage();
      } else if (action === "open-external") {
        const url = target.dataset.url || "";
        if (url && confirm("是否連線到外部網站？")) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } else if (action === "close-preview" || action === "close-modal") {
        state.previewOpen = false;
        state.selectedCard = null;
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

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.id === "searchInput") {
        state.search = target.value;
        window.clearTimeout(searchRenderTimer);
        searchRenderTimer = window.setTimeout(() => {
          renderPreservingScroll();
          const searchInput = document.querySelector("#searchInput");
          if (searchInput instanceof HTMLInputElement) {
            searchInput.focus();
            searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
          }
        }, 250);
      }
    });

    document.addEventListener("dragstart", (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .set-row") : null;
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
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .set-row") : null;
      if (!(item instanceof HTMLElement)) return;
      if (item.dataset.deckIndex === undefined && item.dataset.setIndex === undefined) return;
      event.preventDefault();
      item.classList.add("is-drag-over");
    });

    document.addEventListener("dragleave", (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .set-row") : null;
      item?.classList.remove("is-drag-over");
    });

    document.addEventListener("drop", async (event) => {
      const item = event.target instanceof Element ? event.target.closest(".deck-item, .set-row") : null;
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
      document.querySelectorAll(".deck-item.is-dragging, .deck-item.is-drag-over, .set-row.is-dragging, .set-row.is-drag-over").forEach((item) => {
        item.classList.remove("is-dragging", "is-drag-over");
      });
    });
  }

  function resetFilters() {
    state.search = "";
    state.filters = {
      set_code: [],
      type: [],
      system: [],
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
      suffix: value("Suffix"),
      effect: value("Effect"),
      color: value("Color"),
      image_url: value("ImageUrl"),
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
      suffix: normalizeTextBlock(row[6] ?? ""),
      effect: normalizeTextBlock(row[7] ?? ""),
      color: normalizeTextBlock(row[8] ?? ""),
      image_url: normalizeTextBlock(row[9] ?? ""),
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
      suffix: card.suffix,
      effect: card.effect,
      color: card.color,
      image_url: card.image_url,
      source: "bandai",
      is_active: true
    };
  }

  function toInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  async function upsertSetsFromCards(cards) {
    const setCodes = [...new Set(cards.map((card) => card.set_code).filter(Boolean))].sort();
    const payload = setCodes
      .sort()
      .map((code, index) => ({
        code,
        name: `Battle Spirits ${code}`,
        sort_order: index + 1
      }));

    if (!payload.length) return [];
    const { error } = await db.from("sets").upsert(payload, { onConflict: "code" });
    if (error) throw error;
    return setCodes;
  }

  async function upsertCards(cards) {
    const batchSize = 200;
    for (let index = 0; index < cards.length; index += batchSize) {
      const batch = cards.slice(index, index + batchSize);
      const { error } = await db.from(SUPABASE_TABLE).upsert(batch, { onConflict: "card_number" });
      if (error) throw error;
    }
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
    else state.deck.unshift({ id, count: 1 });

    sortDeckByCardOrder();
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




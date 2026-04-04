const STORE = {
  name: "Conde de Bonfim",
  whatsapp: "5521959039201"
};

const PAYMENT_CONFIG = {
  provider: "infinitepay",
  handle: "andrewadlm",
  checkoutLinkUrl: "https://api.infinitepay.io/invoices/public/checkout/links",
  paymentCheckUrl: "https://api.infinitepay.io/invoices/public/checkout/payment_check",
  redirectUrl: `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}pagamento-sucesso.html`,
  webhookUrl: "",
  orderPrefix: "scdbinfinite"
};

const BRANDS = [
  "Votorantim",
  "Tigre",
  "Suvinil",
  "Tramontina",
  "Deca",
  "Gerdau",
  "Portobello",
  "Atlas"
];

const API_BASE_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://siteoriginal.onrender.com";

const PRODUCTS_ENDPOINT = `${API_BASE_URL}/api/products`;

let PRODUCTS = [];
let offersLoadedProducts = [];
let catalogLoadedProducts = [];

let ALL_CATEGORIES = [];
let ALL_CATEGORIES_TOTAL = 0;
let catalogPage = 1;
let catalogLimit = 24;
let catalogLoading = false;
let catalogHasMore = true;
let catalogLastTotal = 0;

let offersPage = 1;
let offersLimit = 10;
let offersLoading = false;
let offersHasMore = true;

let isCatalogObserverStarted = false;
let isOffersObserverStarted = false;
let isProductsReady = false;

let activeCategory = "Todos";
let searchTerm = "";
let sortBy = "default";
let currentModalProduct = null;

const STORAGE_KEY = "cb_cart_v7";
const CUSTOMER_NAME_KEY = "cb_customer_name";
const CUSTOMER_PHONE_KEY = "cb_customer_phone";
const CUSTOMER_ADDRESS_KEY = "cb_customer_address";
const DELIVERY_TYPE_KEY = "cb_delivery_type";

const cart = new Map();

const catalogFilters = {
  minPrice: null,
  maxPrice: null,
  minDiscount: 0,
  flashOffer: false,
  brands: [],
  saleFormat: "Todos",
  installmentsNoInterest: false
};

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhoneBR(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55")) return `+${digits}`;
  return `+55${digits}`;
}

function priceToCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function generateOrderNSU() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `${PAYMENT_CONFIG.orderPrefix}-${now}-${rand}`;
}

function splitStreetAndNumber(fullAddress) {
  const value = String(fullAddress || "").trim();

  if (!value) {
    return { street: "", number: "" };
  }

  const match = value.match(/^(.*?)(?:,\s*|\s+)(\d+[A-Za-z0-9\-\/]*)$/);

  if (match) {
    return {
      street: match[1].trim(),
      number: match[2].trim()
    };
  }

  return {
    street: value,
    number: "S/N"
  };
}

function waLink(message) {
  return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(message)}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mergeProductsIntoStore(products) {
  if (!Array.isArray(products) || !products.length) return;

  const byId = new Map(PRODUCTS.map((product) => [String(product.id), product]));

  products.forEach((product) => {
    byId.set(String(product.id), product);
  });

  PRODUCTS = Array.from(byId.values());
}

function getSearchSource() {
  if (catalogLoadedProducts.length) return catalogLoadedProducts;
  if (offersLoadedProducts.length) return offersLoadedProducts;
  return PRODUCTS;
}

function getCurrentBaseProducts() {
  const isCatalogPage = Boolean(document.getElementById("catalogGrid"));

  if (isCatalogPage) {
    return catalogLoadedProducts.length ? catalogLoadedProducts : PRODUCTS;
  }

  return PRODUCTS;
}

function getCategorySource() {
  if (catalogLoadedProducts.length) return catalogLoadedProducts;
  if (offersLoadedProducts.length) return offersLoadedProducts;
  return PRODUCTS;
}

function getDynamicCategories() {
  if (ALL_CATEGORIES.length) {
    return ["Todos", ...ALL_CATEGORIES];
  }

  const source = PRODUCTS.length ? PRODUCTS : getCategorySource();

  const categories = [...new Set(
    source
      .map((product) => String(product.category || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  return ["Todos", ...categories];
}

function getDynamicCategoriesWithCount() {
  if (ALL_CATEGORIES.length) {
    return [
      { name: "Todos", count: ALL_CATEGORIES_TOTAL },
      ...ALL_CATEGORIES
    ];
  }

  const source = getCategorySource();
  const counts = new Map();

  source.forEach((product) => {
    const category = String(product.category || "").trim();
    if (!category) return;
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  const sorted = Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }))
    .map(([name, count]) => ({ name, count }));

  return [{ name: "Todos", count: source.length }, ...sorted];
}

async function loadAllCategories() {
  try {
    const pageSize = 1000;
    let page = 1;
    let hasMore = true;
    const categoriesSet = new Set();

    while (hasMore) {
      const result = await fetchProductsPage(page, pageSize);

      result.products.forEach((product) => {
        const category = String(product.category || "").trim();
        if (category) categoriesSet.add(category);
      });

      hasMore = result.hasMore;
      page += 1;
    }

    ALL_CATEGORIES = Array.from(categoriesSet).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  } catch (error) {
    console.error("Erro ao carregar todas as categorias:", error);
    ALL_CATEGORIES = [];
  }
}

function ensureActiveCategoryIsValid() {
  const categories = getDynamicCategories();
  if (!categories.includes(activeCategory)) {
    activeCategory = "Todos";
  }
}

function syncCategoryFilterSelection() {
  const inputs = document.querySelectorAll('input[name="categoryFilter"]');
  inputs.forEach((input) => {
    input.checked = input.value === activeCategory;
  });
}

function renderCatalogCategoryFilters() {
  const container = document.getElementById("catalogCategoryFilters");
  if (!container) return;

  const categories = getDynamicCategoriesWithCount();
  ensureActiveCategoryIsValid();

  container.innerHTML = `
    <h3 class="filtersCard__title">Categorias</h3>
    <div class="filtersCard__options">
      ${categories.map((category) => `
        <label class="filterOption">
          <input
            type="radio"
            name="categoryFilter"
            value="${escapeHtml(category.name)}"
            ${activeCategory === category.name ? "checked" : ""}
          />
          <span>${escapeHtml(category.name)} (${category.count})</span>
        </label>
      `).join("")}
    </div>
  `;

  const categoryInputs = container.querySelectorAll('input[name="categoryFilter"]');

  categoryInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      activeCategory = input.value || "Todos";
      await loadCatalogPage(true);
    });
  });
}

async function fetchProductsPage(page = 1, limit = 100, extraFilters = {}) {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });

    if (extraFilters.search?.trim()) {
      params.set("search", extraFilters.search.trim());
    }

    if (extraFilters.category?.trim() && extraFilters.category !== "Todos") {
      params.set("category", extraFilters.category.trim());
    }

    const url = `${PRODUCTS_ENDPOINT}?${params.toString()}`;
    console.log("🔥 Buscando:", url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    console.log("📦 RESPOSTA API:", data);

    const products = Array.isArray(data.products)
      ? data.products
      : Array.isArray(data)
      ? data
      : [];

    return {
      products,
      hasMore: typeof data.hasMore === "boolean" ? data.hasMore : products.length >= limit,
      total: Number(data.total || 0),
      page: Number(data.page || page),
      limit: Number(data.limit || limit)
    };
  } catch (error) {
    console.error("❌ Erro ao carregar página de produtos:", error);
    return {
      products: [],
      hasMore: false,
      total: 0,
      page,
      limit
    };
  }
}

async function fetchProducts() {
  const firstPage = await fetchProductsPage(1, 12);

  console.log("fetchProducts ->", firstPage);

  PRODUCTS = Array.isArray(firstPage.products) ? firstPage.products : [];
  isProductsReady = PRODUCTS.length > 0;

  sanitizeCartAgainstProducts();

  ensureActiveCategoryIsValid();

  window.dispatchEvent(new CustomEvent("cb:productsLoaded", {
    detail: { products: PRODUCTS }
  }));

  return PRODUCTS;
}

async function loadCategoryCounts() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories`);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();

    ALL_CATEGORIES = Array.isArray(data.categories) ? data.categories : [];
    ALL_CATEGORIES_TOTAL = Number(data.total || 0);
  } catch (error) {
    console.error("Erro ao carregar contagem de categorias:", error);
    ALL_CATEGORIES = [];
    ALL_CATEGORIES_TOTAL = 0;
  }
}

function getCatalogTotalPages() {
  return Math.max(1, Math.ceil(Number(catalogLastTotal || 0) / Number(catalogLimit || 1)));
}

function renderCatalogPagination() {
  const prevBtn = document.getElementById("catalogPrevBtn");
  const nextBtn = document.getElementById("catalogNextBtn");
  const pageInfo = document.getElementById("catalogPageInfo");

  if (!prevBtn || !nextBtn || !pageInfo) return;

  const totalPages = getCatalogTotalPages();

  pageInfo.textContent = `Página ${catalogPage} de ${totalPages}`;

  prevBtn.disabled = catalogPage <= 1;
  nextBtn.disabled = catalogPage >= totalPages || totalPages === 0;
}

function setupCatalogPagination() {
  const prevBtn = document.getElementById("catalogPrevBtn");
  const nextBtn = document.getElementById("catalogNextBtn");

  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener("click", async () => {
    if (catalogPage <= 1 || catalogLoading) return;

    catalogPage -= 1;
    await loadCatalogPage(false);

    document.getElementById("catalogGrid")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  nextBtn.addEventListener("click", async () => {
    const totalPages = getCatalogTotalPages();

    if (catalogPage >= totalPages || catalogLoading) return;

    catalogPage += 1;
    await loadCatalogPage(false);

    document.getElementById("catalogGrid")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

async function loadCatalogPage(reset = false) {
  if (catalogLoading) return;

  const selectedCategory =
    document.querySelector('input[name="categoryFilter"]:checked')?.value ||
    activeCategory ||
    "Todos";

  activeCategory = selectedCategory;

  if (reset) {
    catalogPage = 1;
  }

  catalogLoading = true;
  renderCatalog(catalogLastTotal);

  const result = await fetchProductsPage(catalogPage, catalogLimit, {
    search: searchTerm,
    category: activeCategory
  });

  catalogLoadedProducts = Array.isArray(result.products) ? result.products : [];

  mergeProductsIntoStore(result.products);
  sanitizeCartAgainstProducts();

  catalogHasMore = result.hasMore;
  catalogLastTotal = result.total;
  catalogLoading = false;
  isProductsReady = PRODUCTS.length > 0 || catalogLoadedProducts.length > 0 || offersLoadedProducts.length > 0;

  ensureActiveCategoryIsValid();
  renderCatalogCategoryFilters();
  renderCategories();
  syncCategoryFilterSelection();
  renderCatalog(result.total);
  renderCatalogPagination();
}

async function loadOffersPage(reset = false) {
  if (offersLoading) return;

  if (reset) {
    offersPage = 1;
    offersHasMore = true;
    offersLoadedProducts = [];
  }

  if (!offersHasMore) {
    renderCategories();
    renderOffersInfinite();
    return;
  }

  offersLoading = true;
  renderOffersInfinite();

  const result = await fetchProductsPage(offersPage, offersLimit, {
    search: searchTerm,
    category: activeCategory
  });

  if (reset) {
    offersLoadedProducts = [...result.products];
  } else {
    const map = new Map(offersLoadedProducts.map((product) => [String(product.id), product]));
    result.products.forEach((product) => {
      map.set(String(product.id), product);
    });
    offersLoadedProducts = Array.from(map.values());
  }

  mergeProductsIntoStore(result.products);

  offersHasMore = result.hasMore;
  offersPage += 1;
  offersLoading = false;
  isProductsReady = PRODUCTS.length > 0 || offersLoadedProducts.length > 0;

  ensureActiveCategoryIsValid();
  renderCategories();
  renderOffersInfinite();
}

function loadCart() {
  cart.clear();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    Object.entries(data).forEach(([id, qty]) => {
      const parsedQty = Number(qty);
      const parsedId = String(id);

      if (parsedId && !Number.isNaN(parsedQty) && parsedQty > 0) {
        cart.set(parsedId, parsedQty);
      }
    });
  } catch (error) {
    console.error("Erro ao carregar carrinho:", error);
  }
}

function saveCart() {
  const data = {};
  cart.forEach((qty, id) => {
    data[id] = qty;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  window.dispatchEvent(new CustomEvent("cb:cartUpdated", {
    detail: { count: cartCount(), subtotal: cartSubtotal() }
  }));
}

function cartCount() {
  let total = 0;
  cart.forEach((qty) => {
    total += qty;
  });
  return total;
}

function cartSubtotal() {
  let total = 0;

  cart.forEach((qty, id) => {
    const product = PRODUCTS.find((p) => String(p.id) === String(id));
    if (product) total += Number(product.price || 0) * qty;
  });

  return total;
}

function getCartItems() {
  const items = [];

  cart.forEach((qty, id) => {
    const product = PRODUCTS.find((p) => String(p.id) === String(id));
    if (product) {
      items.push({ product, qty });
    }
  });

  return items;
}

function addToCart(id, delta = 1) {
  const key = String(id);
  const current = cart.get(key) || 0;
  const next = Math.max(0, current + delta);

  if (next === 0) {
    cart.delete(key);
  } else {
    cart.set(key, next);
  }

  saveCart();
  renderCart();
}

function setCartQuantity(id, quantity) {
  const newQty = Math.max(1, quantity);
  cart.set(String(id), newQty);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart.delete(String(id));
  saveCart();
  renderCart();
}

function openDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;

  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;

  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");

  const modal = document.getElementById("productModal");
  if (!modal || !modal.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
}

function getFilteredProducts() {
  let result = [...getCurrentBaseProducts()];

  if (activeCategory !== "Todos") {
    result = result.filter((product) => String(product.category || "").trim() === activeCategory);
  }

  if (searchTerm.trim()) {
    const term = normalizeText(searchTerm);

    result = result.filter((product) => {
      const name = normalizeText(product.name);
      const category = normalizeText(product.category);
      const brand = normalizeText(product.brand);
      const description = normalizeText(product.description);

      return (
        name.includes(term) ||
        category.includes(term) ||
        brand.includes(term) ||
        description.includes(term)
      );
    });
  }

  switch (sortBy) {
    case "price-asc":
      result.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      break;
    case "price-desc":
      result.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      break;
    case "name-asc":
      result.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      break;
    case "name-desc":
      result.sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
      break;
    default:
      break;
  }

  return result;
}

function getOfferProducts() {
  return getFilteredProducts().filter(
    (product) => typeof product.offPct === "number" && product.offPct > 50
  );
}

function getFeaturedProducts() {
  return getFilteredProducts().filter((product) => product.featured);
}

function renderCategories() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const categories = getDynamicCategoriesWithCount();
  ensureActiveCategoryIsValid();

  categories.forEach((category) => {
    const card = document.createElement("button");
    card.className = "catCard" + (activeCategory === category.name ? " is-active" : "");
    card.type = "button";

    card.innerHTML = `
      <div class="catIcon">📦</div>

      <div class="catContent">
        <div class="catTitle">${escapeHtml(category.name)}</div>
        <div class="catCount">
          ${typeof category.count === "number" ? `${category.count} itens` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", async () => {
      activeCategory = category.name;

      if (document.getElementById("catalogGrid")) {
        syncCategoryFilterSelection();
        await loadCatalogPage(true);
      } else {
        renderAllSections();
      }

      document.getElementById("ofertas")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    grid.appendChild(card);
  });
}

function productCard(product) {
  const hasOff = typeof product.offPct === "number" && product.offPct > 0;
  const hasOld = typeof product.oldPrice === "number" && product.oldPrice > product.price;
  const brandLabel = product.brand
    ? `<div class="pCategory">${escapeHtml(product.brand)}</div>`
    : `<div class="pCategory">${escapeHtml(product.category)}</div>`;

  const card = document.createElement("div");
  card.className = "pCard";

  card.innerHTML = `
    <div class="pImg" style="background-image:url('${product.image || "./assets/product-placeholder.jpg"}')">
      ${hasOff ? `<div class="badgeOff">${product.offPct}% OFF</div>` : ""}
    </div>

    <div class="pBody">
      ${brandLabel}
      <p class="pName">${escapeHtml(product.name)}</p>

      <div class="pPrices">
        ${hasOld ? `<div class="oldPrice">${brl(product.oldPrice)}</div>` : `<div class="oldPrice"></div>`}
        <div class="newPrice">${brl(product.price)}</div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:auto;">
        <button class="btn btn--outline productDetailsBtn" type="button">Ver detalhes</button>
        <button class="addBtn" type="button">
          <span aria-hidden="true">🛒</span>
          Adicionar
        </button>
      </div>
    </div>
  `;

  const addBtn = card.querySelector(".addBtn");
  const detailsBtn = card.querySelector(".productDetailsBtn");

  addBtn.addEventListener("click", () => {
    addToCart(product.id, 1);
    openDrawer();
  });

  detailsBtn.addEventListener("click", () => {
    openProductModal(product.id);
  });

  return card;
}

function renderProductsInGrid(gridId, products, emptyMessage) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = "";

  if (!products.length) {
    grid.innerHTML = `<div class="emptyState">${emptyMessage}</div>`;
    return;
  }

  products.forEach((product) => {
    grid.appendChild(productCard(product));
  });
}

function renderOffersInfinite() {
  const grid = document.getElementById("offersGrid");
  const loader = document.getElementById("offersLoader");

  if (!grid) return;

  const source = offersLoadedProducts.length ? offersLoadedProducts : PRODUCTS;

  const promoProducts = [...source]
    .filter((product) => typeof product.offPct === "number" && product.offPct > 0)
    .filter((product) => {
      if (!searchTerm.trim()) return true;
      const term = normalizeText(searchTerm);
      return (
        normalizeText(product.name).includes(term) ||
        normalizeText(product.category).includes(term) ||
        normalizeText(product.brand).includes(term) ||
        normalizeText(product.description).includes(term)
      );
    })
    .filter((product) => activeCategory === "Todos" || String(product.category || "").trim() === activeCategory)
    .sort((a, b) => Number(b.offPct || 0) - Number(a.offPct || 0));

  grid.innerHTML = "";

  if (!promoProducts.length && !offersLoading) {
    grid.innerHTML = `<div class="emptyState">Nenhuma oferta encontrada para esse filtro.</div>`;
  } else {
    promoProducts.forEach((product) => {
      grid.appendChild(productCard(product));
    });
  }

  if (loader) {
    loader.style.display = offersHasMore || offersLoading ? "block" : "none";
    loader.textContent = offersLoading ? "Carregando mais promoções..." : "Role para carregar mais";
  }
}

function renderOffers() {
  renderOffersInfinite();
}

function renderFeatured() {
  renderProductsInGrid(
    "featuredGrid",
    getFeaturedProducts(),
    "Nenhum produto encontrado para esse filtro."
  );
}

function renderBrands() {
  const row = document.getElementById("brandsRow");
  if (!row) return;

  row.innerHTML = "";

  BRANDS.forEach((brand) => {
    const item = document.createElement("div");
    item.className = "brandPill";
    item.textContent = brand;
    row.appendChild(item);
  });
}

function renderResultsCount() {
  const count = getFilteredProducts().length;
  const el = document.getElementById("resultsCount");
  if (el) el.textContent = String(count);
}

function renderCart() {
  const cartCountEl = document.getElementById("cartCount");
  const floatingCountEl = document.getElementById("floatingCartCount");
  const subtotalEl = document.getElementById("cartSubtotal");
  const list = document.getElementById("cartList");
  const empty = document.getElementById("cartEmpty");

  const items = getCartItems();

  const realCount = items.reduce((acc, item) => acc + Number(item.qty || 0), 0);
  const realSubtotal = items.reduce((acc, item) => {
    return acc + Number(item.product.price || 0) * Number(item.qty || 0);
  }, 0);

  if (cartCountEl) cartCountEl.textContent = String(realCount);
  if (floatingCountEl) floatingCountEl.textContent = String(realCount);
  if (subtotalEl) subtotalEl.textContent = brl(realSubtotal);
  if (!list || !empty) return;

  list.innerHTML = "";

  empty.style.display = items.length ? "none" : "block";

  items.forEach(({ product, qty }) => {
    const item = document.createElement("div");
    item.className = "cartItem";

    item.innerHTML = `
      <div class="cartItem__info">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${brl(product.price)} cada</span>
        <small class="cartItem__total">Total do item: ${brl(product.price * qty)}</small>
        <button type="button" class="removeItemBtn" aria-label="Remover produto">Remover</button>
      </div>

      <div class="qty">
        <button type="button" class="qtyBtn" aria-label="Diminuir">-</button>
        <input
          type="number"
          class="qtyInput"
          min="1"
          value="${qty}"
          aria-label="Quantidade"
        />
        <button type="button" class="qtyBtn" aria-label="Aumentar">+</button>
      </div>
    `;

    const qtyButtons = item.querySelectorAll(".qtyBtn");
    const minusBtn = qtyButtons[0];
    const plusBtn = qtyButtons[1];
    const qtyInput = item.querySelector(".qtyInput");
    const removeBtn = item.querySelector(".removeItemBtn");

    minusBtn.addEventListener("click", () => {
      addToCart(product.id, -1);
    });

    plusBtn.addEventListener("click", () => {
      addToCart(product.id, 1);
    });

    function applyManualQuantity() {
      let newQty = parseInt(qtyInput.value, 10);

      if (Number.isNaN(newQty) || newQty < 1) {
        newQty = 1;
      }

      setCartQuantity(product.id, newQty);
    }

    qtyInput.addEventListener("blur", applyManualQuantity);

    qtyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyManualQuantity();
      }
    });

    removeBtn.addEventListener("click", () => {
      removeFromCart(product.id);
    });

    list.appendChild(item);
  });
}

function renderAllSections() {
  renderCategories();
  renderOffers();
  renderFeatured();
  renderResultsCount();
}

function setupSearch() {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const suggestionsBox = document.getElementById("searchSuggestions");

  if (!form || !input) return;

  function hideSuggestions() {
    if (!suggestionsBox) return;
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
  }

  async function applySearchAndRender() {
    searchTerm = input.value.trim();

    if (!isProductsReady && !PRODUCTS.length && !catalogLoadedProducts.length && !offersLoadedProducts.length) {
      hideSuggestions();
      return;
    }

    if (document.getElementById("catalogGrid")) {
      await loadCatalogPage(true);
      return;
    }

    renderAllSections();
  }

  function renderSuggestions(term) {
    if (!suggestionsBox) return;

    const normalizedTerm = normalizeText(term);

    if (!normalizedTerm) {
      hideSuggestions();
      return;
    }

    const source = getSearchSource();

    if (!source.length) {
      hideSuggestions();
      return;
    }

    const suggestions = source.filter((product) => {
      const name = normalizeText(product.name);
      const category = normalizeText(product.category);
      const brand = normalizeText(product.brand);
      const description = normalizeText(product.description);

      return (
        name.includes(normalizedTerm) ||
        category.includes(normalizedTerm) ||
        brand.includes(normalizedTerm) ||
        description.includes(normalizedTerm)
      );
    }).slice(0, 6);

    if (!suggestions.length) {
      hideSuggestions();
      return;
    }

    suggestionsBox.innerHTML = suggestions.map((product) => `
      <div class="searchSuggestionItem" data-name="${String(product.name || "").replace(/"/g, "&quot;")}">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.brand || "Sem marca")} • ${escapeHtml(product.category || "Sem categoria")}</span>
      </div>
    `).join("");

    suggestionsBox.style.display = "block";

    suggestionsBox.querySelectorAll(".searchSuggestionItem").forEach((item) => {
      item.addEventListener("click", async () => {
        const selectedName = item.dataset.name || "";
        input.value = selectedName;
        searchTerm = selectedName;

        if (document.getElementById("catalogGrid")) {
          await loadCatalogPage(true);
        } else {
          renderAllSections();
        }

        hideSuggestions();

        const catalogGrid = document.getElementById("catalogGrid");
        const offersSection = document.getElementById("ofertas");

        if (catalogGrid) {
          catalogGrid.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        } else if (offersSection) {
          offersSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await applySearchAndRender();
    hideSuggestions();

    const catalogGrid = document.getElementById("catalogGrid");
    const offersSection = document.getElementById("ofertas");

    if (catalogGrid) {
      catalogGrid.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } else if (offersSection) {
      offersSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });

  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      await applySearchAndRender();
      renderSuggestions(input.value);
    }, 350);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) {
      renderSuggestions(input.value);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search__field")) {
      hideSuggestions();
    }
  });
}

function setupSort() {
  const select = document.getElementById("sortSelect");
  const catalogSort = document.getElementById("catalogSort");

  if (select) {
    select.addEventListener("change", () => {
      sortBy = select.value;
      renderAllSections();
    });
  }

  if (catalogSort) {
    catalogSort.addEventListener("change", () => {
      renderCatalog(catalogLastTotal);
      renderCatalogPagination();
    });
  }
}

function getSelectedDeliveryType() {
  const selected = document.querySelector('input[name="deliveryType"]:checked');
  return selected ? selected.value : "Entrega";
}

function updateDeliveryUI() {
  const addressField = document.getElementById("addressField");
  const addressInput = document.getElementById("customerAddress");
  const deliveryType = getSelectedDeliveryType();

  if (!addressField || !addressInput) return;

  if (deliveryType === "Retirada") {
    addressField.style.display = "none";
    addressInput.removeAttribute("required");
  } else {
    addressField.style.display = "flex";
    addressInput.setAttribute("required", "required");
  }
}

function buildCartWhatsAppMessage() {
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const addressInput = document.getElementById("customerAddress");

  const customerName = nameInput?.value.trim() || localStorage.getItem(CUSTOMER_NAME_KEY) || "";
  const customerPhone = phoneInput?.value.trim() || localStorage.getItem(CUSTOMER_PHONE_KEY) || "";
  const customerAddress = addressInput?.value.trim() || localStorage.getItem(CUSTOMER_ADDRESS_KEY) || "";
  const deliveryType = getSelectedDeliveryType();

  if (!cartCount()) {
    alert("Seu carrinho está vazio.");
    return null;
  }

  if (!customerName) {
    alert("Por favor, informe seu nome.");
    nameInput?.focus();
    return null;
  }

  if (deliveryType === "Entrega" && !customerAddress) {
    alert("Por favor, informe o endereço de entrega.");
    addressInput?.focus();
    return null;
  }

  const lines = getCartItems().map(({ product, qty }) =>
    `• ${qty}x ${product.name} — ${brl(product.price * qty)}`
  );

  return `Olá! Vim pelo site da ${STORE.name}.\n\nNome: ${customerName}\nTelefone: ${customerPhone || "Não informado"}\nRecebimento: ${deliveryType}\n${deliveryType === "Entrega" ? `Endereço: ${customerAddress}\n` : ""}Itens do pedido:\n${lines.join("\n")}\n\nSubtotal: ${brl(cartSubtotal())}`;
}

function openCheckoutWhatsAppFromCart() {
  const message = buildCartWhatsAppMessage();
  if (!message) return;

  window.open(waLink(message), "_blank", "noreferrer");
}

function setupWhatsApp() {
  const waFloat = document.getElementById("waFloat");

  if (waFloat) {
    const defaultMessage = `Olá! Vim pelo site da ${STORE.name}. Quero um orçamento.`;
    waFloat.href = waLink(defaultMessage);
  }

  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const addressInput = document.getElementById("customerAddress");
  const deliveryTypeInputs = document.querySelectorAll('input[name="deliveryType"]');

  if (nameInput) {
    const savedName = localStorage.getItem(CUSTOMER_NAME_KEY);
    if (savedName) nameInput.value = savedName;

    nameInput.addEventListener("input", () => {
      localStorage.setItem(CUSTOMER_NAME_KEY, nameInput.value.trim());
    });
  }

  if (phoneInput) {
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
    if (savedPhone) phoneInput.value = savedPhone;

    phoneInput.addEventListener("input", () => {
      localStorage.setItem(CUSTOMER_PHONE_KEY, phoneInput.value.trim());
    });
  }

  if (addressInput) {
    const savedAddress = localStorage.getItem(CUSTOMER_ADDRESS_KEY);
    if (savedAddress) addressInput.value = savedAddress;

    addressInput.addEventListener("input", () => {
      localStorage.setItem(CUSTOMER_ADDRESS_KEY, addressInput.value.trim());
    });
  }

  const savedDeliveryType = localStorage.getItem(DELIVERY_TYPE_KEY) || "Entrega";
  deliveryTypeInputs.forEach((input) => {
    input.checked = input.value === savedDeliveryType;

    input.addEventListener("change", () => {
      localStorage.setItem(DELIVERY_TYPE_KEY, input.value);
      updateDeliveryUI();
    });
  });

  updateDeliveryUI();
}

function setupDrawer() {
  const openBtn = document.getElementById("openCart");
  const closeBtn = document.getElementById("closeCart");
  const backdrop = document.getElementById("drawerBackdrop");
  const floatingCart = document.getElementById("floatingCart");
  const continueShoppingBtn = document.getElementById("continueShoppingBtn");
  const goCheckoutBtn = document.getElementById("goCheckoutBtn");

  if (openBtn) openBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  if (floatingCart) floatingCart.addEventListener("click", openDrawer);
  if (continueShoppingBtn) continueShoppingBtn.addEventListener("click", closeDrawer);

  if (goCheckoutBtn) {
    goCheckoutBtn.addEventListener("click", () => {
      const nameInput = document.getElementById("customerName");
      const phoneInput = document.getElementById("customerPhone");
      const addressInput = document.getElementById("customerAddress");
      const deliveryType = getSelectedDeliveryType();

      if (!cartCount()) {
        alert("Seu carrinho está vazio.");
        return;
      }

      if (nameInput?.value.trim()) {
        localStorage.setItem(CUSTOMER_NAME_KEY, nameInput.value.trim());
      }

      if (phoneInput?.value.trim()) {
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneInput.value.trim());
      }

      if (addressInput?.value.trim()) {
        localStorage.setItem(CUSTOMER_ADDRESS_KEY, addressInput.value.trim());
      }

      localStorage.setItem(DELIVERY_TYPE_KEY, deliveryType);
      window.location.href = "./checkout.html";
    });
  }
}

function openProductModal(productId) {
  const product = PRODUCTS.find((p) => String(p.id) === String(productId))
    || catalogLoadedProducts.find((p) => String(p.id) === String(productId))
    || offersLoadedProducts.find((p) => String(p.id) === String(productId));

  if (!product) return;

  currentModalProduct = product;

  const modal = document.getElementById("productModal");
  const image = document.getElementById("productModalImage");
  const category = document.getElementById("productModalCategory");
  const title = document.getElementById("productModalTitle");
  const description = document.getElementById("productModalDescription");
  const oldPrice = document.getElementById("productModalOldPrice");
  const price = document.getElementById("productModalPrice");
  const addBtn = document.getElementById("productModalAddBtn");

  if (!modal || !image || !category || !title || !description || !oldPrice || !price || !addBtn) {
    return;
  }

  image.src = product.image || "./assets/product-placeholder.jpg";
  image.alt = product.name || "Produto";
  category.textContent = product.brand || product.category || "Produto";
  title.textContent = product.name || "Produto";
  description.textContent = product.description || "Sem descrição disponível.";
  oldPrice.textContent = product.oldPrice ? brl(product.oldPrice) : "";
  price.textContent = brl(product.price);

  addBtn.onclick = () => {
    addToCart(product.id, 1);
    closeProductModal();
    openDrawer();
  };

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeProductModal() {
  const modal = document.getElementById("productModal");
  if (!modal) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");

  const drawer = document.getElementById("drawer");
  if (!drawer || !drawer.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
}

function setupProductModal() {
  const modal = document.getElementById("productModal");
  const closeBtn = document.getElementById("productModalClose");
  const backdrop = document.getElementById("productModalBackdrop");

  if (closeBtn) closeBtn.addEventListener("click", closeProductModal);
  if (backdrop) backdrop.addEventListener("click", closeProductModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-open")) {
      closeProductModal();
    }
  });
}

function getCatalogFilteredProducts() {
  let result = [...catalogLoadedProducts];

  if (catalogFilters.minPrice !== null) {
    result = result.filter((product) => Number(product.price || 0) >= Number(catalogFilters.minPrice));
  }

  if (catalogFilters.maxPrice !== null) {
    result = result.filter((product) => Number(product.price || 0) <= Number(catalogFilters.maxPrice));
  }

  if (catalogFilters.minDiscount > 0) {
    result = result.filter((product) => Number(product.offPct || 0) >= Number(catalogFilters.minDiscount));
  }

  if (catalogFilters.flashOffer) {
    result = result.filter((product) => Boolean(product.flashOffer));
  }

  if (catalogFilters.brands.length) {
    result = result.filter((product) => catalogFilters.brands.includes(String(product.brand || "")));
  }

  if (catalogFilters.saleFormat !== "Todos") {
    result = result.filter((product) => String(product.saleFormat || "") === catalogFilters.saleFormat);
  }

  if (catalogFilters.installmentsNoInterest) {
    result = result.filter((product) => Boolean(product.installmentsNoInterest));
  }

  const catalogSort = document.getElementById("catalogSort")?.value || "default";

  switch (catalogSort) {
    case "price-asc":
      result.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      break;
    case "price-desc":
      result.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      break;
    case "name-asc":
      result.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }));
      break;
    case "name-desc":
      result.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "pt-BR", { sensitivity: "base" }));
      break;
    case "discount-desc":
      result.sort((a, b) => Number(b.offPct || 0) - Number(a.offPct || 0));
      break;
    default:
      break;
  }

  return result;
}

function renderCatalog(totalFromApi = null) {
  const grid = document.getElementById("catalogGrid");
  const count = document.getElementById("catalogCount");
  const loader = document.getElementById("catalogLoader");

  if (!grid) return;

  const products = getCatalogFilteredProducts();

  grid.innerHTML = "";

  if (count) {
    count.textContent = String(totalFromApi ?? catalogLastTotal ?? products.length);
  }

  if (!products.length) {
    grid.innerHTML = `<div class="emptyState">Nenhum produto encontrado para esse filtro.</div>`;
  } else {
    products.forEach((product) => {
      grid.appendChild(productCard(product));
    });
  }

  if (loader) {
    loader.style.display = catalogLoading ? "block" : "none";
    loader.textContent = "Carregando produtos...";
  }
}

function setupCatalogInfiniteScroll() {
  const sentinel = document.getElementById("catalogInfiniteSentinel");
  if (sentinel) {
    sentinel.style.display = "none";
  }
  isCatalogObserverStarted = true;
}

function setupOffersInfiniteScroll() {
  if (isOffersObserverStarted) return;

  const sentinel = document.getElementById("offersInfiniteSentinel");
  if (!sentinel) return;

  const observer = new IntersectionObserver(async (entries) => {
    const entry = entries[0];
    if (!entry.isIntersecting) return;
    if (offersLoading || !offersHasMore) return;

    await loadOffersPage(false);
  }, {
    root: null,
    rootMargin: "300px 0px",
    threshold: 0
  });

  observer.observe(sentinel);
  isOffersObserverStarted = true;
}

function setupAdvancedCatalogFilters() {
  const discountInput = document.getElementById("discountRange");
  const discountValue = document.getElementById("discountRangeValue");
  const brandInputs = document.querySelectorAll('input[name="brandFilter"]');
  const saleFormatInputs = document.querySelectorAll('input[name="saleFormatFilter"]');
  const flashOfferInput = document.getElementById("flashOfferFilter");
  const installmentsInput = document.getElementById("installmentsFilter");
  const priceRangeButtons = document.querySelectorAll(".priceRangeBtn");
  const applyPriceBtn = document.getElementById("applyPriceFilterBtn");
  const priceMinInput = document.getElementById("priceMinInput");
  const priceMaxInput = document.getElementById("priceMaxInput");

  if (discountInput) {
    discountInput.addEventListener("input", () => {
      catalogFilters.minDiscount = Number(discountInput.value || 0);
      if (discountValue) discountValue.textContent = `${catalogFilters.minDiscount}%`;
      renderCatalog(catalogLastTotal);
    });
  }

  brandInputs.forEach((input) => {
    input.addEventListener("change", () => {
      catalogFilters.brands = [...brandInputs]
        .filter((item) => item.checked)
        .map((item) => item.value);

      renderCatalog(catalogLastTotal);
    });
  });

  saleFormatInputs.forEach((input) => {
    input.addEventListener("change", () => {
      catalogFilters.saleFormat = input.value || "Todos";
      renderCatalog(catalogLastTotal);
    });
  });

  if (flashOfferInput) {
    flashOfferInput.addEventListener("change", () => {
      catalogFilters.flashOffer = flashOfferInput.checked;
      renderCatalog(catalogLastTotal);
    });
  }

  if (installmentsInput) {
    installmentsInput.addEventListener("change", () => {
      catalogFilters.installmentsNoInterest = installmentsInput.checked;
      renderCatalog(catalogLastTotal);
    });
  }

  priceRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.priceRange || "";

      if (value === "0-150") {
        catalogFilters.minPrice = 0;
        catalogFilters.maxPrice = 150;
      } else if (value === "150-250") {
        catalogFilters.minPrice = 150;
        catalogFilters.maxPrice = 250;
      } else if (value === "250+") {
        catalogFilters.minPrice = 250;
        catalogFilters.maxPrice = null;
      }

      if (priceMinInput) priceMinInput.value = catalogFilters.minPrice ?? "";
      if (priceMaxInput) priceMaxInput.value = catalogFilters.maxPrice ?? "";

      renderCatalog(catalogLastTotal);
    });
  });

  if (applyPriceBtn) {
    applyPriceBtn.addEventListener("click", () => {
      const minRaw = priceMinInput?.value?.trim() || "";
      const maxRaw = priceMaxInput?.value?.trim() || "";

      catalogFilters.minPrice = minRaw ? Number(minRaw) : null;
      catalogFilters.maxPrice = maxRaw ? Number(maxRaw) : null;

      renderCatalog(catalogLastTotal);
    });
  }
}

function ensureCatalogPagination() {
  const grid = document.getElementById("catalogGrid");
  if (!grid) return;

  let pagination = document.getElementById("catalogPagination");

  if (!pagination) {
    pagination = document.createElement("div");
    pagination.id = "catalogPagination";
    pagination.className = "catalogPagination";
    pagination.innerHTML = `
      <button id="catalogPrevBtn" class="catalogPageBtn" type="button">Anterior</button>
      <span id="catalogPageInfo" class="catalogPageInfo">Página 1 de 1</span>
      <button id="catalogNextBtn" class="catalogPageBtn" type="button">Próxima</button>
    `;

    grid.insertAdjacentElement("afterend", pagination);
  }

  const loader = document.getElementById("catalogLoader");
  if (loader) {
    loader.style.display = "none";
  }

  const sentinel = document.getElementById("catalogInfiniteSentinel");
  if (sentinel) {
    sentinel.style.display = "none";
  }
}

function setupCatalog() {
  const grid = document.getElementById("catalogGrid");
  if (!grid) return;

  const sortSelect = document.getElementById("catalogSort");

  renderCatalogCategoryFilters();
  ensureCatalogPagination();
  setupCatalogPagination();

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderCatalog(catalogLastTotal);
      renderCatalogPagination();
    });
  }

  setupAdvancedCatalogFilters();
}

function exposeAppApi() {
  window.CondeBonfimApp = {
    STORE,
    PAYMENT_CONFIG,
    STORAGE_KEY,
    CUSTOMER_NAME_KEY,
    CUSTOMER_PHONE_KEY,
    CUSTOMER_ADDRESS_KEY,
    DELIVERY_TYPE_KEY,
    get products() {
      return PRODUCTS;
    },
    fetchProducts,
    fetchProductsPage,
    loadCatalogPage,
    loadOffersPage,
    loadCart,
    saveCart,
    cartCount,
    cartSubtotal,
    getCartItems,
    addToCart,
    setCartQuantity,
    removeFromCart,
    brl,
    onlyDigits,
    normalizePhoneBR,
    priceToCents,
    generateOrderNSU,
    splitStreetAndNumber,
    waLink,
    renderCart,
    openDrawer,
    closeDrawer,
    getDynamicCategories,
    renderCategories,
    renderCatalogCategoryFilters
  };

  window.editCart = function editCartGlobal() {
    localStorage.setItem("openCart", "true");
    window.location.href = "./index.html";
  };

  window.goBackPage = function goBackPageGlobal() {
    if (document.referrer) {
      history.back();
    } else {
      window.location.href = "./index.html";
    }
  };
}

function setupCategoryCollapse() {
  const button = document.getElementById("toggleCategoryFilters");
  const content = document.getElementById("catalogCategoryFilters");

  if (!button || !content) return;

  button.addEventListener("click", () => {
    const isExpanded = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!isExpanded));
    content.classList.toggle("is-collapsed", isExpanded);

    const icon = button.querySelector(".filterCollapseIcon");
    if (icon) {
      icon.textContent = isExpanded ? "+" : "-";
    }
  });
}

function sanitizeCartAgainstProducts() {
  if (!PRODUCTS.length) return;

  let changed = false;

  for (const [id, qty] of cart.entries()) {
    const exists = PRODUCTS.some((p) => String(p.id) === String(id));

    if (!exists || !Number.isFinite(Number(qty)) || Number(qty) <= 0) {
      cart.delete(id);
      changed = true;
    }
  }

  if (changed) {
    saveCart();
  }
}

async function init() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  exposeAppApi();

  loadCart();
  setupSearch();
  setupSort();
  setupWhatsApp();
  setupDrawer();
  setupProductModal();
  setupCategoryCollapse();

  const isCatalogPage = Boolean(document.getElementById("catalogGrid"));
  const isHomeOffers = Boolean(document.getElementById("offersGrid"));

  if (isCatalogPage) {
    renderBrands();
    await loadCategoryCounts();
    setupCatalog();
    await loadCatalogPage(true);
    renderCart();
  } else {
    const products = await fetchProducts();

    console.log("HOME PRODUCTS ->", products);

    renderBrands();
    renderAllSections();
    renderCart();
  }

  if (isHomeOffers) {
    await loadOffersPage(true);
    setupOffersInfiniteScroll();
  }

  if (localStorage.getItem("openCart") === "true") {
    openDrawer();
    localStorage.removeItem("openCart");
  }

  return {
    productsLoaded: PRODUCTS.length > 0 || catalogLoadedProducts.length > 0 || offersLoadedProducts.length > 0,
    products: PRODUCTS
  };
}

window.__CB_APP_READY__ = init();
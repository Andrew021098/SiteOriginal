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

const CATEGORIES = [
  { name: "Todos", icon: "🧩" },
  { name: "Materiais de Construção", icon: "🏗️" },
  { name: "Cimento e Concreto", icon: "🧱" },
  { name: "Blocos e Tijolos", icon: "🧱" },
  { name: "Ferragens", icon: "🔩" },
  { name: "Materiais Elétricos", icon: "⚡" },
  { name: "Materiais Hidráulicos", icon: "💧" },
  { name: "Tintas e Acessórios", icon: "🎨" },
  { name: "Ferramentas", icon: "🛠️" },
  { name: "Portas e Janelas", icon: "🚪" },
  { name: "Banheiros e Acessórios", icon: "🚽" }
];

let PRODUCTS = [];

const API_BASE_URL = "https://sitecondebonfim.onrender.com";
const PRODUCTS_ENDPOINT = `${API_BASE_URL}/api/products`;

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

async function fetchProducts() {
  try {
    const response = await fetch(PRODUCTS_ENDPOINT);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.products)) {
      throw new Error("Resposta inválida da API.");
    }

    PRODUCTS = data.products;

    window.dispatchEvent(new CustomEvent("cb:productsLoaded", {
      detail: { products: PRODUCTS }
    }));

    return PRODUCTS;
  } catch (error) {
    console.error("Erro ao carregar produtos:", error);
    PRODUCTS = [];

    window.dispatchEvent(new CustomEvent("cb:productsLoaded", {
      detail: { products: PRODUCTS }
    }));

    return [];
  }
}

function loadCart() {
  cart.clear();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    Object.entries(data).forEach(([id, qty]) => {
      const parsedId = Number(id);
      const parsedQty = Number(qty);

      if (!Number.isNaN(parsedId) && !Number.isNaN(parsedQty) && parsedQty > 0) {
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
    const product = PRODUCTS.find((p) => Number(p.id) === Number(id));
    if (product) total += Number(product.price || 0) * qty;
  });

  return total;
}

function getCartItems() {
  const items = [];

  cart.forEach((qty, id) => {
    const product = PRODUCTS.find((p) => Number(p.id) === Number(id));
    if (product) {
      items.push({ product, qty });
    }
  });

  return items;
}

function addToCart(id, delta = 1) {
  const current = cart.get(id) || 0;
  const next = Math.max(0, current + delta);

  if (next === 0) {
    cart.delete(id);
  } else {
    cart.set(id, next);
  }

  saveCart();
  renderCart();
}

function setCartQuantity(id, quantity) {
  const newQty = Math.max(1, quantity);
  cart.set(id, newQty);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart.delete(id);
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
  let result = [...PRODUCTS];

  if (activeCategory !== "Todos") {
    result = result.filter((product) => product.category === activeCategory);
  }

  if (searchTerm.trim()) {
    const term = normalizeText(searchTerm);

    result = result.filter((product) => {
      const name = normalizeText(product.name);
      const category = normalizeText(product.category);
      "const brand = normalizeText(product.brand);"
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
    (product) => typeof product.offPct === "number" && product.offPct > 0
  );
}

function getFeaturedProducts() {
  return getFilteredProducts().filter((product) => product.featured);
}

function renderCategories() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  CATEGORIES.forEach((category) => {
    const card = document.createElement("button");
    card.className = "catCard" + (activeCategory === category.name ? " is-active" : "");
    card.type = "button";

    card.innerHTML = `
      <div class="catIcon">${category.icon}</div>
      <div class="catTitle">${category.name}</div>
    `;

    card.addEventListener("click", () => {
      activeCategory = category.name;
      renderAllSections();
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
  const brandLabel = product.brand ? `<div class="pCategory">${product.brand}</div>` : `<div class="pCategory">${product.category}</div>`;

  const card = document.createElement("div");
  card.className = "pCard";

  card.innerHTML = `
    <div class="pImg" style="background-image:url('${product.image || "./assets/product-placeholder.jpg"}')">
      ${hasOff ? `<div class="badgeOff">${product.offPct}% OFF</div>` : ""}
    </div>

    <div class="pBody">
      ${brandLabel}
      <p class="pName">${product.name}</p>

      <div class="pPrices">
        ${hasOld ? `<div class="oldPrice">${brl(product.oldPrice)}</div>` : `<div class="oldPrice"></div>`}
        <div class="newPrice">${brl(product.price)}</div>
      </div>

      ${
        ""
      }

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

function renderOffers() {
  renderProductsInGrid(
    "offersGrid",
    getOfferProducts(),
    "Nenhuma oferta encontrada para esse filtro."
  );
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

  if (cartCountEl) cartCountEl.textContent = String(cartCount());
  if (floatingCountEl) floatingCountEl.textContent = String(cartCount());
  if (subtotalEl) subtotalEl.textContent = brl(cartSubtotal());
  if (!list || !empty) return;

  list.innerHTML = "";

  const items = getCartItems();
  empty.style.display = items.length ? "none" : "block";

  items.forEach(({ product, qty }) => {
    const item = document.createElement("div");
    item.className = "cartItem";

    item.innerHTML = `
      <div class="cartItem__info">
        <strong>${product.name}</strong>
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

  function applySearchAndRender() {
    searchTerm = input.value.trim();
    renderAllSections();
    renderCatalog();
  }

  function renderSuggestions(term) {
    if (!suggestionsBox) return;

    const normalizedTerm = normalizeText(term);

    if (!normalizedTerm) {
      hideSuggestions();
      return;
    }

    const suggestions = PRODUCTS.filter((product) => {
      const name = normalizeText(product.name);
      const category = normalizeText(product.category);
      const brand = normalizeText(product.brand);

      return (
        name.includes(normalizedTerm) ||
        category.includes(normalizedTerm) ||
        brand.includes(normalizedTerm)
      );
    }).slice(0, 6);

    if (!suggestions.length) {
      hideSuggestions();
      return;
    }

    suggestionsBox.innerHTML = suggestions.map((product) => `
      <div class="searchSuggestionItem" data-name="${product.name}">
        <strong>${product.name}</strong>
        <span>${product.brand || "Sem marca"} • ${product.category || "Sem categoria"}</span>
      </div>
    `).join("");

    suggestionsBox.style.display = "block";

    suggestionsBox.querySelectorAll(".searchSuggestionItem").forEach((item) => {
      item.addEventListener("click", () => {
        const selectedName = item.dataset.name || "";
        input.value = selectedName;
        searchTerm = selectedName;

        renderAllSections();
        renderCatalog();
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applySearchAndRender();
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
    applySearchAndRender();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderSuggestions(input.value);
    }, 120);
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function setupSort() {
  const select = document.getElementById("sortSelect");
  if (!select) return;

  select.addEventListener("change", () => {
    sortBy = select.value;
    renderAllSections();
  });
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

  return `Olá! Vim pelo site da ${STORE.name}.

Nome: ${customerName}
Telefone: ${customerPhone || "Não informado"}
Recebimento: ${deliveryType}
${deliveryType === "Entrega" ? `Endereço: ${customerAddress}\n` : ""}Itens do pedido:
${lines.join("\n")}

Subtotal: ${brl(cartSubtotal())}`;
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
  const product = PRODUCTS.find((p) => p.id === productId);
  const modal = document.getElementById("productModal");

  if (!product || !modal) return;

  currentModalProduct = product;

  const modalProductName = document.getElementById("modalProductName");
  const modalProductCategory = document.getElementById("modalProductCategory");
  const modalProductPrice = document.getElementById("modalProductPrice");
  const modalProductDescription = document.getElementById("modalProductDescription");
  const modalQtyInput = document.getElementById("modalQtyInput");
  const oldPriceEl = document.getElementById("modalProductOldPrice");
  const imageEl = document.getElementById("modalProductImage");

  if (modalProductName) modalProductName.textContent = product.name;
  if (modalProductCategory) modalProductCategory.textContent = product.category;
  if (modalProductPrice) modalProductPrice.textContent = brl(product.price);
  if (modalProductDescription) {
    modalProductDescription.textContent = product.description || "Produto sem descrição.";
  }
  if (modalQtyInput) modalQtyInput.value = "1";

  if (oldPriceEl) {
    if (typeof product.oldPrice === "number" && product.oldPrice > product.price) {
      oldPriceEl.textContent = brl(product.oldPrice);
    } else {
      oldPriceEl.textContent = "";
    }
  }

  if (imageEl) {
    imageEl.style.backgroundImage = `url('${product.image || "./assets/product-placeholder.jpg"}')`;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeProductModal() {
  const modal = document.getElementById("productModal");
  if (!modal) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  currentModalProduct = null;

  const drawer = document.getElementById("drawer");
  if (!drawer || !drawer.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
}

function updateModalTotal() {
  if (!currentModalProduct) return;

  const qtyInput = document.getElementById("modalQtyInput");
  const descriptionEl = document.getElementById("modalProductDescription");
  if (!qtyInput || !descriptionEl) return;

  let qty = parseInt(qtyInput.value, 10);
  if (Number.isNaN(qty) || qty < 1) qty = 1;

  const total = currentModalProduct.price * qty;

  descriptionEl.textContent =
    `${currentModalProduct.description || "Produto sem descrição."} Quantidade selecionada: ${qty}. Total: ${brl(total)}.`;
}

function setupProductModal() {
  const modal = document.getElementById("productModal");
  const closeBtn = document.getElementById("closeProductModal");
  const backdrop = document.getElementById("productModalBackdrop");
  const minusBtn = document.getElementById("modalQtyMinus");
  const plusBtn = document.getElementById("modalQtyPlus");
  const qtyInput = document.getElementById("modalQtyInput");
  const addBtn = document.getElementById("modalAddToCart");
  const buyNowBtn = document.getElementById("modalBuyNow");

  if (!modal || !qtyInput) return;

  if (closeBtn) closeBtn.addEventListener("click", closeProductModal);
  if (backdrop) backdrop.addEventListener("click", closeProductModal);

  if (minusBtn) {
    minusBtn.addEventListener("click", () => {
      let value = parseInt(qtyInput.value, 10) || 1;
      value = Math.max(1, value - 1);
      qtyInput.value = value;
      updateModalTotal();
    });
  }

  if (plusBtn) {
    plusBtn.addEventListener("click", () => {
      let value = parseInt(qtyInput.value, 10) || 1;
      value += 1;
      qtyInput.value = value;
      updateModalTotal();
    });
  }

  function normalizeModalQty() {
    let value = parseInt(qtyInput.value, 10);
    if (Number.isNaN(value) || value < 1) value = 1;
    qtyInput.value = value;
    updateModalTotal();
    return value;
  }

  qtyInput.addEventListener("blur", normalizeModalQty);

  qtyInput.addEventListener("input", () => {
    if (qtyInput.value.trim() === "") return;
    updateModalTotal();
  });

  qtyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      normalizeModalQty();
    }
  });

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (!currentModalProduct) return;

      const quantity = normalizeModalQty();
      addToCart(currentModalProduct.id, quantity);
      closeProductModal();
      openDrawer();
    });
  }

  if (buyNowBtn) {
    buyNowBtn.addEventListener("click", () => {
      if (!currentModalProduct) return;

      const quantity = normalizeModalQty();
      addToCart(currentModalProduct.id, quantity);
      closeProductModal();
      window.location.href = "./checkout.html";
    });
  }
}

function getCatalogFilteredProducts() {
  let products = [...PRODUCTS];

  const selectedCategory =
    document.querySelector('input[name="categoryFilter"]:checked')?.value || "Todos";
  const selectedSort = document.getElementById("catalogSort")?.value || "default";

  if (selectedCategory !== "Todos") {
    products = products.filter((product) => product.category === selectedCategory);
  }

  if (searchTerm.trim()) {
    const term = normalizeText(searchTerm);

    products = products.filter((product) => {
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

  if (catalogFilters.minPrice !== null) {
    products = products.filter((product) => Number(product.price || 0) >= catalogFilters.minPrice);
  }

  if (catalogFilters.maxPrice !== null) {
    products = products.filter((product) => Number(product.price || 0) <= catalogFilters.maxPrice);
  }

  if (catalogFilters.minDiscount > 0) {
    products = products.filter((product) => Number(product.offPct || 0) >= catalogFilters.minDiscount);
  }

  if (catalogFilters.flashOffer) {
    products = products.filter((product) => Boolean(product.flashOffer));
  }

  if (catalogFilters.brands.length) {
    products = products.filter((product) =>
      catalogFilters.brands.includes(product.brand)
    );
  }

  if (catalogFilters.saleFormat !== "Todos") {
    products = products.filter((product) =>
      (product.saleFormat || "Unidade") === catalogFilters.saleFormat
    );
  }

  if (catalogFilters.installmentsNoInterest) {
    products = products.filter((product) => Boolean(product.installmentsNoInterest));
  }

  switch (selectedSort) {
    case "price-asc":
      products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      break;
    case "price-desc":
      products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      break;
    case "name-asc":
      products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      break;
    case "name-desc":
      products.sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
      break;
    default:
      break;
  }

  return products;
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  const count = document.getElementById("catalogCount");

  if (!grid) return;

  const products = getCatalogFilteredProducts();

  grid.innerHTML = "";

  if (count) {
    count.textContent = String(products.length);
  }

  if (!products.length) {
    grid.innerHTML = `<div class="emptyState">Nenhum produto encontrado para esse filtro.</div>`;
    return;
  }

  products.forEach((product) => {
    grid.appendChild(productCard(product));
  });
}

function setupAdvancedCatalogFilters() {
  const discountInputs = document.querySelectorAll('input[name="discountFilter"]');
  const brandInputs = document.querySelectorAll('input[name="brandFilter"]');
  const saleFormatInputs = document.querySelectorAll('input[name="saleFormatFilter"]');
  const flashOfferInput = document.getElementById("filterFlashOffer");
  const installmentsInput = document.getElementById("filterInstallmentsNoInterest");
  const priceMinInput = document.getElementById("priceMin");
  const priceMaxInput = document.getElementById("priceMax");
  const applyPriceBtn = document.getElementById("applyPriceRange");
  const priceRangeButtons = document.querySelectorAll("[data-price-range]");

  discountInputs.forEach((input) => {
    input.addEventListener("change", () => {
      catalogFilters.minDiscount = Number(input.value || 0);
      renderCatalog();
    });
  });

  brandInputs.forEach((input) => {
    input.addEventListener("change", () => {
      catalogFilters.brands = [...brandInputs]
        .filter((item) => item.checked)
        .map((item) => item.value);

      renderCatalog();
    });
  });

  saleFormatInputs.forEach((input) => {
    input.addEventListener("change", () => {
      catalogFilters.saleFormat = input.value || "Todos";
      renderCatalog();
    });
  });

  if (flashOfferInput) {
    flashOfferInput.addEventListener("change", () => {
      catalogFilters.flashOffer = flashOfferInput.checked;
      renderCatalog();
    });
  }

  if (installmentsInput) {
    installmentsInput.addEventListener("change", () => {
      catalogFilters.installmentsNoInterest = installmentsInput.checked;
      renderCatalog();
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

      renderCatalog();
    });
  });

  if (applyPriceBtn) {
    applyPriceBtn.addEventListener("click", () => {
      const minRaw = priceMinInput?.value?.trim() || "";
      const maxRaw = priceMaxInput?.value?.trim() || "";

      catalogFilters.minPrice = minRaw ? Number(minRaw) : null;
      catalogFilters.maxPrice = maxRaw ? Number(maxRaw) : null;

      renderCatalog();
    });
  }
}

function setupCatalog() {
  const grid = document.getElementById("catalogGrid");
  if (!grid) return;

  const categoryInputs = document.querySelectorAll('input[name="categoryFilter"]');
  const sortSelect = document.getElementById("catalogSort");

  categoryInputs.forEach((input) => {
    input.addEventListener("change", () => {
      renderCatalog();
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderCatalog();
    });
  }

  setupAdvancedCatalogFilters();
  renderCatalog();
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
    closeDrawer
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

  const products = await fetchProducts();

  if (products.length) {
    renderBrands();
    renderAllSections();
    setupCatalog();
    renderCart();
  } else {
    console.error("Nenhum produto carregado.");
    renderCart();
  }

  if (localStorage.getItem("openCart") === "true") {
    openDrawer();
    localStorage.removeItem("openCart");
  }

  return {
    productsLoaded: products.length > 0,
    products
  };
}

window.__CB_APP_READY__ = init();
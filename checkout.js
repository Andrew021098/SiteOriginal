/* ================================
CONFIGURAÇÃO
================================ */

const ATIVAR_PAGAMENTO = false;
const BACKEND_URL = "https://siteoriginal.onrender.com";
const CHECKOUT_ONLINE_ATIVO = false;

/* ================================
UTILS
================================ */

function getAppApi() {
  return window.CondeBonfimApp || null;
}

function onlyDigits(value) {
  const app = getAppApi();
  if (app?.onlyDigits) return app.onlyDigits(value);
  return String(value || "").replace(/\D/g, "");
}

function brl(value) {
  const app = getAppApi();
  if (app?.brl) return app.brl(value);

  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getCartItemsSafe() {
  const app = getAppApi();

  if (app?.getCartItems) {
    const items = app.getCartItems();
    if (Array.isArray(items) && items.length) return items;
  }

  try {
    const raw = localStorage.getItem("cb_cart_v7");
    if (!raw) return [];

    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      return data
        .filter(item => item && item.id && Number(item.qty) > 0)
        .map(item => ({
          product: {
            id: item.id,
            name: item.name || "Produto",
            price: Number(item.price || 0),
            image: item.image || "",
            category: item.category || ""
          },
          qty: Number(item.qty || 0)
        }));
    }

    return [];
  } catch (error) {
    console.error("Erro ao ler carrinho no checkout:", error);
    return [];
  }
}

function cartSubtotalSafe() {
  const app = getAppApi();

  if (app?.cartSubtotal) {
    const subtotal = Number(app.cartSubtotal());
    if (!Number.isNaN(subtotal) && subtotal > 0) return subtotal;
  }

  const items = getCartItemsSafe();

  return items.reduce((total, { product, qty }) => {
    return total + (Number(product.price || 0) * Number(qty || 0));
  }, 0);
}

function cartCountSafe() {
  const app = getAppApi();
  return app?.cartCount ? app.cartCount() : 0;
}

function loadCartSafe() {
  const app = getAppApi();
  if (app?.loadCart) app.loadCart();
}

/* ================================
TIPO ENTREGA / PAGAMENTO
================================ */

function getCheckoutDeliveryType() {
  return document.querySelector('input[name="checkoutDeliveryType"]:checked')?.value || "Entrega";
}

function getCheckoutPaymentMethod() {
  return document.querySelector('input[name="checkoutPaymentMethod"]:checked')?.value || "PIX";
}

function updateCheckoutDeliveryUI() {
  const addressWrap = document.getElementById("checkoutAddressWrap");
  const deliveryType = getCheckoutDeliveryType();

  if (!addressWrap) return;

  addressWrap.style.display = deliveryType === "Retirada" ? "none" : "block";
}

function setupPaymentButtonVisibility() {
  const btnPagamento = document.getElementById("btnFinalizarPagamento");
  if (!btnPagamento) return;

  if (!ATIVAR_PAGAMENTO || !CHECKOUT_ONLINE_ATIVO) {
    btnPagamento.style.display = "none";
  } else {
    btnPagamento.style.display = "";
  }
}

/* ================================
PERSISTÊNCIA LOCAL
================================ */

function fillCheckoutFormFromStorage() {

  const nameInput = document.getElementById("checkoutName");
  const phoneInput = document.getElementById("checkoutPhone");
  const emailInput = document.getElementById("checkoutEmail");

  const cepInput = document.getElementById("cep");
  const addressInput = document.getElementById("address");
  const numberInput = document.getElementById("number");
  const complementInput = document.getElementById("complement");
  const districtInput = document.getElementById("district");
  const cityInput = document.getElementById("city");
  const stateInput = document.getElementById("state");

  const notesInput = document.getElementById("checkoutNotes");

  if (nameInput) nameInput.value = localStorage.getItem("cb_customer_name") || "";
  if (phoneInput) phoneInput.value = localStorage.getItem("cb_customer_phone") || "";
  if (emailInput) emailInput.value = localStorage.getItem("cb_checkout_email") || "";

  if (cepInput) cepInput.value = localStorage.getItem("cb_checkout_zip") || "";
  if (addressInput) addressInput.value = localStorage.getItem("cb_customer_address") || "";
  if (numberInput) numberInput.value = localStorage.getItem("cb_checkout_number") || "";
  if (complementInput) complementInput.value = localStorage.getItem("cb_checkout_complement") || "";
  if (districtInput) districtInput.value = localStorage.getItem("cb_checkout_district") || "";
  if (cityInput) cityInput.value = localStorage.getItem("cb_checkout_city") || "";
  if (stateInput) stateInput.value = localStorage.getItem("cb_checkout_state") || "";

  if (notesInput) notesInput.value = localStorage.getItem("cb_checkout_notes") || "";

  const savedDelivery = localStorage.getItem("cb_delivery_type") || "Entrega";

  document.querySelectorAll('input[name="checkoutDeliveryType"]').forEach((input) => {
    input.checked = input.value === savedDelivery;
  });

  const savedPayment = localStorage.getItem("cb_checkout_payment_method") || "PIX";

  document.querySelectorAll('input[name="checkoutPaymentMethod"]').forEach((input) => {
    input.checked = input.value === savedPayment;
  });

  updateCheckoutDeliveryUI();
}

function setupCheckoutFieldPersistence() {

  const fieldMap = [
    ["checkoutName", "cb_customer_name"],
    ["checkoutPhone", "cb_customer_phone"],
    ["checkoutEmail", "cb_checkout_email"],
    ["cep", "cb_checkout_zip"],
    ["address", "cb_customer_address"],
    ["number", "cb_checkout_number"],
    ["complement", "cb_checkout_complement"],
    ["district", "cb_checkout_district"],
    ["city", "cb_checkout_city"],
    ["state", "cb_checkout_state"],
    ["checkoutNotes", "cb_checkout_notes"]
  ];

  fieldMap.forEach(([id, key]) => {

    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("input", () => {
      localStorage.setItem(key, el.value.trim());
    });

  });

  document.querySelectorAll('input[name="checkoutDeliveryType"]').forEach((input) => {

    input.addEventListener("change", () => {

      localStorage.setItem("cb_delivery_type", input.value);
      updateCheckoutDeliveryUI();

    });

  });

  document.querySelectorAll('input[name="checkoutPaymentMethod"]').forEach((input) => {

    input.addEventListener("change", () => {

      localStorage.setItem("cb_checkout_payment_method", input.value);

    });

  });
}

/* ================================
RENDER CHECKOUT
================================ */

function renderCheckoutPage() {

  const itemsWrap = document.getElementById("checkoutItems");
  const subtotalEl = document.getElementById("checkoutSubtotal");
  const totalEl = document.getElementById("checkoutTotal");
  const shippingEl = document.getElementById("checkoutShippingValue");

  if (!itemsWrap || !subtotalEl || !totalEl || !shippingEl) return;

  const items = getCartItemsSafe();

  itemsWrap.innerHTML = "";

  if (!items.length) {

    itemsWrap.innerHTML = `<div class="emptyState">Seu carrinho está vazio.</div>`;

    subtotalEl.textContent = brl(0);
    totalEl.textContent = brl(0);

    shippingEl.textContent = "A combinar";

    return;
  }

  items.forEach(({ product, qty }) => {

    const item = document.createElement("div");

    item.className = "checkoutItem";

    item.innerHTML = `
      <div class="checkoutItem__info">
        <span class="checkoutItem__name">${product.name}</span>
        <span class="checkoutItem__meta">${qty}x ${brl(product.price)}</span>
      </div>

      <strong class="checkoutItem__value">
        ${brl(Number(product.price || 0) * qty)}
      </strong>
    `;

    itemsWrap.appendChild(item);

  });

  const subtotal = cartSubtotalSafe();

  subtotalEl.textContent = brl(subtotal);
  totalEl.textContent = brl(subtotal);
  shippingEl.textContent = "A combinar";
}

/* ================================
BUILD DATA
================================ */

function buildCheckoutData() {
  const address = (document.getElementById("address")?.value || "").trim();
  const number = (document.getElementById("number")?.value || "").trim();
  const complement = (document.getElementById("complement")?.value || "").trim();
  const district = (document.getElementById("district")?.value || "").trim();
  const city = (document.getElementById("city")?.value || "").trim();
  const state = (document.getElementById("state")?.value || "").trim();
  const zip = onlyDigits(document.getElementById("cep")?.value || "");

  const fullAddress = [address, number, complement, district, city, state, zip]
    .filter(Boolean)
    .join(", ");

  return {

    name: (document.getElementById("checkoutName")?.value || "").trim(),
    phone: (document.getElementById("checkoutPhone")?.value || "").trim(),
    email: (document.getElementById("checkoutEmail")?.value || "").trim(),

    deliveryType: getCheckoutDeliveryType(),

    address: fullAddress,
    street: address,
    number,
    complement,
    district,
    city,
    state,
    zip,

    paymentMethod: getCheckoutPaymentMethod(),

    notes: (document.getElementById("checkoutNotes")?.value || "").trim(),

    items: getCartItemsSafe().map(({ product, qty }) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      qty
    })),

    subtotal: cartSubtotalSafe(),
    total: cartSubtotalSafe()
  };

}

/* ================================
VALIDAÇÃO
================================ */

function validateCheckoutData(data) {

  if (!data.items.length) {
    alert("Seu carrinho está vazio.");
    return false;
  }

  if (!data.name) {
    alert("Informe seu nome.");
    document.getElementById("checkoutName")?.focus();
    return false;
  }

  if (!data.phone) {
    alert("Informe seu telefone.");
    document.getElementById("checkoutPhone")?.focus();
    return false;
  }

  if (data.deliveryType === "Entrega") {
    if (!data.zip) {
      alert("Informe o CEP.");
      document.getElementById("cep")?.focus();
      return false;
    }

    if (!data.street) {
      alert("Informe o endereço.");
      document.getElementById("address")?.focus();
      return false;
    }

    if (!data.number) {
      alert("Informe o número.");
      document.getElementById("number")?.focus();
      return false;
    }
  }

  return true;
}

/* ================================
ENVIO DO ORÇAMENTO
================================ */

async function sendBudgetToWhatsApp() {
  const data = buildCheckoutData();

  if (!validateCheckoutData(data)) return;

  // Meta Pixel - Lead enviado
if (typeof fbq !== "undefined") {
  fbq("track", "Lead", {
    content_name: "Orçamento WhatsApp",
    currency: "BRL"
  });
}

  const btn = document.getElementById("checkoutWhatsBtn");

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Enviando orçamento...";
  }

  try {
    const response = await fetch(`${BACKEND_URL}/distribuir-lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log("Resposta do backend:", result);

    if (!result.success) {
      alert(result.message || "Erro ao enviar orçamento.");
      return;
    }

    const whatsappUrl = result.whatsapp_url || result.whatsappLink || result.link;

    if (!whatsappUrl) {
      alert("Vendedor não retornou link de WhatsApp.");
      return;
    }

    window.open(whatsappUrl, "_blank", "noreferrer");
  } catch (error) {
    console.error("Erro:", error);
    alert("Erro ao conectar com o servidor.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = "Enviar orçamento no WhatsApp";
    }
  }
}

/* ================================
BOTÕES
================================ */

function bindCheckoutButtons() {
  const whatsBtn = document.getElementById("checkoutWhatsBtn");
  const paymentBtn = document.getElementById("btnFinalizarPagamento");

  if (whatsBtn) {
    whatsBtn.addEventListener("click", sendBudgetToWhatsApp);
  }

  if (paymentBtn) {
    paymentBtn.addEventListener("click", () => {
      alert("Pagamento online ainda não está ativado.");
    });
  }
}

/* ================================
APP READY
================================ */

async function waitForAppReady() {
  if (window.__CB_APP_READY__ && typeof window.__CB_APP_READY__.then === "function") {
    try {
      await window.__CB_APP_READY__;
      return;
    } catch (error) {
      console.error("Erro aguardando app.js:", error);
    }
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, 4000);

    window.addEventListener("cb:productsLoaded", () => {
      clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}

/* ================================
INIT
================================ */

async function setupCheckoutPage() {
  setupPaymentButtonVisibility();
  fillCheckoutFormFromStorage();

  setupCepMask();
  setupCepLookup();

  setupCheckoutFieldPersistence();
  bindCheckoutButtons();

  loadCartSafe();
  await waitForAppReady();
  loadCartSafe();
  renderCheckoutPage();

  window.addEventListener("cb:cartUpdated", () => {
    loadCartSafe();
    renderCheckoutPage();
  });
}

document.addEventListener("DOMContentLoaded", setupCheckoutPage);

function setupCepMask() {
  const cepInput = document.getElementById("cep");
  if (!cepInput) return;

  cepInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    value = value.replace(/^(\d{5})(\d)/, "$1-$2");
    e.target.value = value.slice(0, 9);
  });
}

async function fetchAddressByCep() {
  const cepInput = document.getElementById("cep");
  const addressInput = document.getElementById("address");
  const districtInput = document.getElementById("district");
  const cityInput = document.getElementById("city");
  const stateInput = document.getElementById("state");

  if (!cepInput) return;

  const cep = onlyDigits(cepInput.value);
  if (cep.length !== 8) return;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      alert("CEP não encontrado.");
      return;
    }

    if (addressInput) {
      addressInput.value = data.logradouro || "";
      localStorage.setItem("cb_customer_address", addressInput.value);
    }

    if (districtInput) {
      districtInput.value = data.bairro || "";
      localStorage.setItem("cb_checkout_district", districtInput.value);
    }

    if (cityInput) {
      cityInput.value = data.localidade || "";
      localStorage.setItem("cb_checkout_city", cityInput.value);
    }

    if (stateInput) {
      stateInput.value = data.uf || "";
      localStorage.setItem("cb_checkout_state", stateInput.value);
    }

    document.getElementById("number")?.focus();
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);
  }
}

function setupCepLookup() {
  const cepInput = document.getElementById("cep");
  if (!cepInput) return;

  cepInput.addEventListener("blur", fetchAddressByCep);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCartSafe();
  renderCheckoutPage();

  window.addEventListener("cb:cartUpdated", () => {
    renderCheckoutPage();
  });
});
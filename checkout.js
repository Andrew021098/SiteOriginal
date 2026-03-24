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
  return app?.getCartItems ? app.getCartItems() : [];
}

function cartSubtotalSafe() {
  const app = getAppApi();
  return app?.cartSubtotal ? app.cartSubtotal() : 0;
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
  const addressInput = document.getElementById("checkoutAddress");
  const complementInput = document.getElementById("checkoutComplement");
  const zipInput = document.getElementById("checkoutZip");
  const notesInput = document.getElementById("checkoutNotes");

  if (nameInput) nameInput.value = localStorage.getItem("cb_customer_name") || "";
  if (phoneInput) phoneInput.value = localStorage.getItem("cb_customer_phone") || "";
  if (emailInput) emailInput.value = localStorage.getItem("cb_checkout_email") || "";
  if (addressInput) addressInput.value = localStorage.getItem("cb_customer_address") || "";
  if (complementInput) complementInput.value = localStorage.getItem("cb_checkout_complement") || "";
  if (zipInput) zipInput.value = localStorage.getItem("cb_checkout_zip") || "";
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
    ["checkoutAddress", "cb_customer_address"],
    ["checkoutComplement", "cb_checkout_complement"],
    ["checkoutZip", "cb_checkout_zip"],
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

  return {

    name: (document.getElementById("checkoutName")?.value || "").trim(),
    phone: (document.getElementById("checkoutPhone")?.value || "").trim(),
    email: (document.getElementById("checkoutEmail")?.value || "").trim(),

    deliveryType: getCheckoutDeliveryType(),

    address: (document.getElementById("checkoutAddress")?.value || "").trim(),
    complement: (document.getElementById("checkoutComplement")?.value || "").trim(),

    zip: onlyDigits(document.getElementById("checkoutZip")?.value || ""),

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

  if (data.deliveryType === "Entrega" && !data.address) {
    alert("Informe o endereço de entrega.");
    document.getElementById("checkoutAddress")?.focus();
    return false;
  }

  return true;
}

/* ================================
ENVIO DO ORÇAMENTO
================================ */

async function sendBudgetToWhatsApp() {

  const data = buildCheckoutData();

  if (!validateCheckoutData(data)) return;

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

    if (!result.success) {

      alert(result.message || "Erro ao enviar orçamento.");
      return;

    }

    const whatsappUrl = result.whatsapp_url;

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
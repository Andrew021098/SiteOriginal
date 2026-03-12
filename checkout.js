const CHECKOUT_ONLINE_ATIVO = false;

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

function renderCheckoutPage() {
  const itemsWrap = document.getElementById("checkoutItems");
  const subtotalEl = document.getElementById("checkoutSubtotal");
  const totalEl = document.getElementById("checkoutTotal");
  const shippingEl = document.getElementById("checkoutShippingValue");

  if (!itemsWrap || !subtotalEl || !totalEl || !shippingEl) return;

  const items = getCartItems();
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
      <strong class="checkoutItem__value">${brl(product.price * qty)}</strong>
    `;
    itemsWrap.appendChild(item);
  });

  const subtotal = cartSubtotal();
  subtotalEl.textContent = brl(subtotal);
  totalEl.textContent = brl(subtotal);
  shippingEl.textContent = "A combinar";
}

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
    items: getCartItems().map(({ product, qty }) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      qty
    })),
    subtotal: cartSubtotal(),
    total: cartSubtotal()
  };
}

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

function setLeadButtonLoading(isLoading) {
  const whatsBtn = document.getElementById("checkoutWhatsBtn");
  if (!whatsBtn) return;

  if (isLoading) {
    whatsBtn.disabled = true;
    whatsBtn.dataset.originalText = whatsBtn.textContent;
    whatsBtn.textContent = "Enviando orçamento...";
    whatsBtn.style.opacity = "0.85";
    whatsBtn.style.cursor = "wait";
  } else {
    whatsBtn.disabled = false;
    whatsBtn.textContent = whatsBtn.dataset.originalText || "Enviar orçamento no WhatsApp";
    whatsBtn.style.opacity = "";
    whatsBtn.style.cursor = "";
  }
}

function setCheckoutModeUI() {
  const payBtn = document.getElementById("checkoutPayBtn");
  const whatsBtn = document.getElementById("checkoutWhatsBtn");

  if (payBtn) {
    payBtn.style.display = CHECKOUT_ONLINE_ATIVO ? "block" : "none";
  }

  if (whatsBtn) {
    whatsBtn.style.display = "block";
    whatsBtn.textContent = "Enviar orçamento no WhatsApp";
  }
}

async function sendBudgetToWhatsApp() {
  const data = buildCheckoutData();

  if (!validateCheckoutData(data)) return;

  console.log("Dados enviados para distribuição:", data);
  setLeadButtonLoading(true);

  try {
    const response = await fetch("https://sitecondebonfim.onrender.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const text = await response.text();
    console.log("Resposta bruta do backend:", text);

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      setLeadButtonLoading(false);
      alert("O backend respondeu, mas não retornou JSON válido.");
      return;
    }

    console.log("Resposta do backend:", result);

    if (!response.ok || !result.success) {
      setLeadButtonLoading(false);
      alert(result.message || "Não foi possível distribuir o orçamento.");
      return;
    }

    const whatsappUrl = String(result.whatsapp_url || "").trim();

    if (!whatsappUrl) {
      setLeadButtonLoading(false);
      alert("O backend não retornou a URL do WhatsApp.");
      return;
    }

    console.log("Lead distribuído para:", result.vendedor);
    console.log("Abrindo WhatsApp:", whatsappUrl);

    window.open(whatsappUrl, "_blank");
    setLeadButtonLoading(false);
  } catch (error) {
    console.error("Erro ao conectar com o backend:", error);
    setLeadButtonLoading(false);
    alert("Erro ao conectar com o backend. Verifique se o servidor Node.js está rodando em https://sitecondebonfim.onrender.com.");
  }
}

async function proceedToPayment() {
  const data = buildCheckoutData();

  if (!validateCheckoutData(data)) return;

  try {
    const response = await fetch("https://sitecondebonfim.onrender.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || "Não foi possível criar o checkout.");
      return;
    }

    const checkoutUrl = String(result.checkout_url || "").trim();

    if (!checkoutUrl) {
      alert("URL de checkout não recebida.");
      return;
    }

    window.open(checkoutUrl, "_self");
  } catch (error) {
    console.error("Erro ao conectar com o backend:", error);
    alert("Erro ao conectar com o backend.");
  }
}

function editCart() {
  localStorage.setItem("openCart", "true");
  window.location.href = "./index.html";
}

function goBackPage() {
  if (document.referrer) {
    history.back();
  } else {
    window.location.href = "./index.html";
  }
}

function setupCheckoutPage() {
  const payBtn = document.getElementById("checkoutPayBtn");
  const whatsBtn = document.getElementById("checkoutWhatsBtn");

  fillCheckoutFormFromStorage();
  setupCheckoutFieldPersistence();
  renderCheckoutPage();
  setCheckoutModeUI();

  if (CHECKOUT_ONLINE_ATIVO && payBtn) {
    payBtn.addEventListener("click", proceedToPayment);
  }

  if (whatsBtn) {
    whatsBtn.addEventListener("click", sendBudgetToWhatsApp);
  }
}

document.addEventListener("DOMContentLoaded", setupCheckoutPage);
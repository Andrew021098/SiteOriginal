require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* CONTROLE DE DISTRIBUIÇÃO */
const REUTILIZAR_MESMO_VENDEDOR = false;

app.use(cors());
app.use(express.json());

const vendedoresFile = path.join(__dirname, "vendedores.json");
const leadsFile = path.join(__dirname, "leads.json");
const filaFile = path.join(__dirname, "fila.json");

/* UTILIDADES */

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function brl(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function normalizePhone(phone) {
  const digits = onlyDigits(phone);
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

/* DADOS */

function getVendedores() {
  const data = readJson(vendedoresFile, { vendedores: [] });
  return data.vendedores.filter(v => v.ativo);
}

function getLeads() {
  return readJson(leadsFile, { leads: [] });
}

function saveLead(lead) {
  const leads = getLeads();
  leads.leads.push(lead);
  writeJson(leadsFile, leads);
}

function getFila() {
  return readJson(filaFile, { ultimo_vendedor_id: 0 });
}

function saveFila(data) {
  writeJson(filaFile, data);
}

/* RODÍZIO */

function pickNextVendedor() {

  const vendedores = getVendedores();
  const fila = getFila();

  const indexAtual = vendedores.findIndex(v => v.id === fila.ultimo_vendedor_id);

  const nextIndex =
    indexAtual === -1
      ? 0
      : (indexAtual + 1) % vendedores.length;

  const vendedor = vendedores[nextIndex];

  saveFila({
    ultimo_vendedor_id: vendedor.id
  });

  return vendedor;
}

/* BUSCA LEAD RECENTE */

function getRecentLeadByPhone(phone) {

  const leads = getLeads().leads;

  const normalized = normalizePhone(phone);

  const limiteTempo = 30 * 60 * 1000;

  const now = Date.now();

  return leads.find(lead => {

    if (!lead.cliente) return false;

    if (normalizePhone(lead.cliente.telefone) !== normalized) return false;

    const created = new Date(lead.created_at).getTime();

    return now - created <= limiteTempo;

  });

}

/* ESCOLHER VENDEDOR */

function chooseVendedor(phone) {

  if (REUTILIZAR_MESMO_VENDEDOR) {

    const recentLead = getRecentLeadByPhone(phone);

    if (recentLead?.vendedor_responsavel?.id) {

      const vendedores = getVendedores();

      const vendedor = vendedores.find(
        v => v.id === recentLead.vendedor_responsavel.id
      );

      if (vendedor) {
        return {
          vendedor,
          reused: true
        };
      }
    }
  }

  const vendedor = pickNextVendedor();

  return {
    vendedor,
    reused: false
  };

}

/* MENSAGEM WHATSAPP */

function buildWhatsMessage(data, vendedor) {

  const items = data.itens
    .map(i => `• ${i.quantidade}x ${i.nome} — ${brl(i.subtotal)}`)
    .join("\n");

  const endereco =
    data.entrega.tipo === "Entrega"
      ? `${data.entrega.endereco}`
      : "Retirada na loja";

  return `*Olá ${vendedor.nome}, chegou um novo orçamento do site.*

*Cliente:* ${data.cliente.nome}
*Telefone:* ${data.cliente.telefone}

*Itens do pedido:*
${items}

*Total estimado:* ${brl(data.resumo.total)}

*Forma de pagamento:* ${data.pagamento.metodo}

*Recebimento:* ${data.entrega.tipo}

*Endereço:* ${endereco}
`;

}

/* ROTA PRINCIPAL */

app.post("/distribuir-lead", (req, res) => {

  try {

    const body = req.body;

    const items = body.items.map(item => ({
      id: item.id,
      nome: item.name,
      quantidade: item.qty,
      preco: item.price,
      subtotal: item.qty * item.price
    }));

    const total = items.reduce((sum, i) => sum + i.subtotal, 0);

    const escolha = chooseVendedor(body.phone);

    const vendedor = escolha.vendedor;

    const lead = {

      id: `lead-${Date.now()}`,

      created_at: new Date().toISOString(),

      cliente: {
        nome: body.name,
        telefone: normalizePhone(body.phone),
        email: body.email || ""
      },

      entrega: {
        tipo: body.deliveryType,
        endereco: body.address,
        cep: body.zip
      },

      pagamento: {
        metodo: body.paymentMethod
      },

      itens: items,

      resumo: {
        total
      },

      vendedor_responsavel: {
        id: vendedor.id,
        nome: vendedor.nome,
        telefone: vendedor.telefone
      }

    };

    saveLead(lead);

    const message = buildWhatsMessage(lead, vendedor);

    const whatsappUrl =
      `https://wa.me/${vendedor.telefone}?text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      vendedor,
      whatsapp_url: whatsappUrl
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Erro interno ao distribuir lead."
    });

  }

});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
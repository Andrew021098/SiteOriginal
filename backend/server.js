const Firebird = require("node-firebird");

const dbOptions = {
  host: "127.0.0.1", // ou IP do servidor
  port: 3050,
  database: "C:\\caminho\\do\\seu\\banco.fdb", // ⚠️ AJUSTAR
  user: "SYSDBA",
  password: "masterkey",
  lowercase_keys: true,
  role: null,
  pageSize: 4096
};

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/*
  false = sempre roda entre todos os vendedores ativos
  true  = se o mesmo telefone mandar lead recente, mantém o mesmo vendedor
*/
const REUTILIZAR_MESMO_VENDEDOR = false;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const vendedoresFile = path.join(__dirname, "vendedores.json");
const leadsFile = path.join(__dirname, "leads.json");
const filaFile = path.join(__dirname, "fila.json");
const productsFile = path.join(__dirname, "products.json");

/* =========================
   UTILITÁRIOS
========================= */

function ensureFile(filePath, fallbackData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2), "utf-8");
  }
}

function readJson(filePath, fallbackData) {
  try {
    ensureFile(filePath, fallbackData);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw || JSON.stringify(fallbackData));
  } catch (error) {
    console.error(`Erro ao ler ${filePath}:`, error);
    return fallbackData;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Erro ao escrever ${filePath}:`, error);
  }
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && Number(item.qty) > 0 && Number(item.price) > 0)
    .map((item) => {
      const quantidade = Number(item.qty);
      const precoUnitario = Number(item.price);

      return {
        id: item.id,
        nome: String(item.name || "Item sem nome").trim(),
        quantidade,
        preco_unitario: precoUnitario,
        subtotal: Number((quantidade * precoUnitario).toFixed(2))
      };
    });
}

function generateLeadId(existingLeads) {
  const nextNumber = (existingLeads?.length || 0) + 1;
  return `lead-${String(nextNumber).padStart(4, "0")}`;
}

/* =========================
   LEITURA / ESCRITA
========================= */

function getVendedoresData() {
  return readJson(vendedoresFile, { vendedores: [] });
}

function getLeadsData() {
  return readJson(leadsFile, { leads: [] });
}

function getFilaData() {
  return readJson(filaFile, { ultimo_vendedor_id: 0 });
}

function getProductsData() {
  return readJson(productsFile, []);
}

function saveLeadsData(data) {
  writeJson(leadsFile, data);
}

function saveFilaData(data) {
  writeJson(filaFile, data);
}

/* =========================
   VENDEDORES / FILA
========================= */

function getActiveVendedores() {
  const data = getVendedoresData();

  return (data.vendedores || [])
    .filter((vendedor) => vendedor.ativo === true)
    .sort((a, b) => Number(a.ordem) - Number(b.ordem));
}

function pickNextVendedor() {
  const vendedores = getActiveVendedores();
  const fila = getFilaData();

  if (!vendedores.length) return null;

  const ultimoId = Number(fila.ultimo_vendedor_id || 0);
  const currentIndex = vendedores.findIndex(
    (vendedor) => Number(vendedor.id) === ultimoId
  );

  let nextVendedor;

  if (currentIndex === -1) {
    nextVendedor = vendedores[0];
  } else {
    nextVendedor = vendedores[(currentIndex + 1) % vendedores.length];
  }

  saveFilaData({
    ultimo_vendedor_id: Number(nextVendedor.id)
  });

  return nextVendedor;
}

/* =========================
   REGRAS DE DUPLICIDADE
========================= */

function getRecentLeadByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const leadsData = getLeadsData();
  const now = Date.now();
  const timeWindowMs = 30 * 60 * 1000; // 30 minutos

  const found = (leadsData.leads || [])
    .filter((lead) => normalizePhone(lead?.cliente?.telefone) === normalizedPhone)
    .filter((lead) => {
      const createdAt = new Date(lead.created_at).getTime();
      return !Number.isNaN(createdAt) && now - createdAt <= timeWindowMs;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return found[0] || null;
}

function chooseVendedor(phone) {
  if (REUTILIZAR_MESMO_VENDEDOR) {
    const recentLead = getRecentLeadByPhone(phone);

    if (recentLead?.vendedor_responsavel?.id) {
      const vendedores = getActiveVendedores();
      const sameVendedor = vendedores.find(
        (vendedor) => Number(vendedor.id) === Number(recentLead.vendedor_responsavel.id)
      );

      if (sameVendedor) {
        return {
          vendedor: sameVendedor,
          reused: true,
          previousLeadId: recentLead.id
        };
      }
    }
  }

  const vendedor = pickNextVendedor();

  return {
    vendedor,
    reused: false,
    previousLeadId: null
  };
}

/* =========================
   LEAD / MENSAGEM
========================= */

function buildLeadRecord(body, vendedor, reused = false) {
  const leadsData = getLeadsData();
  const safeItems = sanitizeItems(body.items);

  const total = Number(
    safeItems.reduce((sum, item) => sum + Number(item.subtotal), 0).toFixed(2)
  );

  return {
    id: generateLeadId(leadsData.leads || []),
    created_at: new Date().toISOString(),
    cliente: {
      nome: String(body.name || "").trim(),
      telefone: normalizePhone(body.phone),
      email: String(body.email || "").trim()
    },
    entrega: {
      tipo: body.deliveryType || "Entrega",
      endereco: String(body.address || "").trim(),
      complemento: String(body.complement || "").trim(),
      cep: String(body.zip || "").trim()
    },
    pagamento: {
      metodo: body.paymentMethod || "PIX"
    },
    itens: safeItems,
    resumo: {
      subtotal: total,
      frete: "A combinar",
      total
    },
    observacoes: String(body.notes || "").trim(),
    vendedor_responsavel: {
      id: vendedor.id,
      nome: vendedor.nome,
      telefone: vendedor.telefone
    },
    status: "novo",
    reutilizado_mesmo_vendedor: reused
  };
}

function saveLead(leadRecord) {
  const leadsData = getLeadsData();
  leadsData.leads.push(leadRecord);
  saveLeadsData(leadsData);
}

function buildWhatsAppMessage(data, vendedor) {
  const itemsText = (data.itens || [])
    .map((item) => `• ${item.quantidade}x ${item.nome} — ${brl(item.subtotal)}`)
    .join("\n");

  const enderecoEntrega =
    data.entrega.tipo === "Entrega"
      ? `${data.entrega.endereco}${data.entrega.complemento ? `, ${data.entrega.complemento}` : ""}${data.entrega.cep ? ` | CEP: ${data.entrega.cep}` : ""}`
      : "Retirada na loja";

  return `Olá ${vendedor.nome}, chegou um novo orçamento do site.

Cliente: ${data.cliente.nome}
Telefone: ${data.cliente.telefone}
E-mail: ${data.cliente.email || "Não informado"}

Itens do pedido:
${itemsText}

Total estimado: ${brl(data.resumo.total)}
Forma de pagamento: ${data.pagamento.metodo}
Recebimento: ${data.entrega.tipo}
Endereço de entrega: ${enderecoEntrega}
${data.observacoes ? `Observações: ${data.observacoes}` : ""}`;
}

/* =========================
   ROTAS
========================= */

app.get("/", (req, res) => {
  res.send("Backend de distribuição de leads online");
});

app.get("/vendedores", (req, res) => {
  const data = getVendedoresData();

  res.json({
    success: true,
    vendedores: data.vendedores || []
  });
});

app.get("/leads", (req, res) => {
  const data = getLeadsData();

  res.json({
    success: true,
    leads: data.leads || []
  });
});

app.get("/api/products", (req, res) => {
  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error("Erro conexão Firebird:", err);
      return res.status(500).json({ success: false });
    }

    const query = `
      SELECT
        ID,
        NAME,
        IMAGE,
        DESCRIPTION,
        CATEGORY,
        STOCK,
        PRICE,
        PROMO_PRICE
      FROM BANCOSQL
    `;

    db.query(query, (err, result) => {
      db.detach();

      if (err) {
        console.error("Erro query:", err);
        return res.status(500).json({ success: false });
      }

      const products = result.map((row) => {
        const price = Number(row.price || 0);
        const promo = Number(row.promo_price || 0);

        let finalPrice = price;
        let oldPrice = null;
        let offPct = null;

        if (promo && promo < price) {
          finalPrice = promo;
          oldPrice = price;
          offPct = Math.round(((price - promo) / price) * 100);
        }

        return {
          id: row.id,
          name: row.name,
          category: row.category,
          price: finalPrice,
          oldPrice,
          offPct,
          freeShip: false,
          image: row.image,
          featured: false,
          description: row.description
        };
      });

      res.json({
        success: true,
        total: products.length,
        products
      });
    });
  });
});

app.get("/api/products/featured", (req, res) => {
  try {
    const products = getProductsData();
    const featuredProducts = products.filter((product) => product.featured === true);

    res.json({
      success: true,
      total: featuredProducts.length,
      products: featuredProducts
    });
  } catch (error) {
    console.error("ERRO EM /api/products/featured:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos em destaque."
    });
  }
});

app.get("/api/products/category/:category", (req, res) => {
  try {
    const products = getProductsData();
    const categoryParam = String(req.params.category || "").trim().toLowerCase();

    const filteredProducts = products.filter(
      (product) => String(product.category || "").trim().toLowerCase() === categoryParam
    );

    res.json({
      success: true,
      total: filteredProducts.length,
      products: filteredProducts
    });
  } catch (error) {
    console.error("ERRO EM /api/products/category/:category:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao filtrar produtos por categoria."
    });
  }
});

app.get("/api/products/search", (req, res) => {
  try {
    const products = getProductsData();
    const query = String(req.query.q || "").trim().toLowerCase();

    if (!query) {
      return res.json({
        success: true,
        total: products.length,
        products
      });
    }

    const filteredProducts = products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const category = String(product.category || "").toLowerCase();
      const description = String(product.description || "").toLowerCase();

      return (
        name.includes(query) ||
        category.includes(query) ||
        description.includes(query)
      );
    });

    res.json({
      success: true,
      total: filteredProducts.length,
      products: filteredProducts
    });
  } catch (error) {
    console.error("ERRO EM /api/products/search:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao buscar produtos."
    });
  }
});

app.post("/distribuir-lead", (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      deliveryType,
      address,
      complement,
      zip,
      paymentMethod,
      notes,
      items
    } = req.body;

    const safeItems = sanitizeItems(items);

    if (!safeItems.length) {
      return res.status(400).json({
        success: false,
        message: "Carrinho vazio."
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Nome é obrigatório."
      });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({
        success: false,
        message: "Telefone é obrigatório."
      });
    }

    if (deliveryType === "Entrega" && (!address || !String(address).trim())) {
      return res.status(400).json({
        success: false,
        message: "Endereço é obrigatório para entrega."
      });
    }

    const escolha = chooseVendedor(phone);

    if (!escolha.vendedor) {
      return res.status(500).json({
        success: false,
        message: "Nenhum vendedor ativo disponível."
      });
    }

    const leadRecord = buildLeadRecord(req.body, escolha.vendedor, escolha.reused);
    saveLead(leadRecord);

    const message = buildWhatsAppMessage(leadRecord, escolha.vendedor);
    const whatsappUrl = `https://wa.me/${escolha.vendedor.telefone}?text=${encodeURIComponent(message)}`;

    console.log("NOVO LEAD DISTRIBUÍDO:");
    console.log({
      lead_id: leadRecord.id,
      cliente: leadRecord.cliente.nome,
      telefone: leadRecord.cliente.telefone,
      vendedor: escolha.vendedor.nome,
      vendedor_id: escolha.vendedor.id,
      reutilizado_mesmo_vendedor: escolha.reused
    });

    return res.json({
      success: true,
      lead_id: leadRecord.id,
      vendedor: {
        id: escolha.vendedor.id,
        nome: escolha.vendedor.nome,
        telefone: escolha.vendedor.telefone
      },
      reused_previous_seller: escolha.reused,
      whatsapp_url: whatsappUrl,
      message
    });
  } catch (error) {
    console.error("ERRO EM /distribuir-lead:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno ao distribuir lead."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
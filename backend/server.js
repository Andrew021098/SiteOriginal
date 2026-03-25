require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Firebird = require("node-firebird");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   FIREBIRD CONFIG
========================= */

const dbOptions = {
  host: process.env.FIREBIRD_HOST || "192.168.88.247",
  port: Number(process.env.FIREBIRD_PORT || 3050),
  database: process.env.FIREBIRD_DATABASE || "/opt/firebird/bancos/MIAUTOMEC.FDB",
  user: process.env.FIREBIRD_USER || "SYSDBA",
  password: process.env.FIREBIRD_PASSWORD || "masterkey",
  lowercase_keys: true
};

/* =========================
   CONFIG
========================= */

const REUTILIZAR_MESMO_VENDEDOR = false;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use("/assets", express.static(path.join(__dirname, "assets")));

const vendedoresFile = path.join(__dirname, "vendedores.json");
const leadsFile = path.join(__dirname, "leads.json");
const filaFile = path.join(__dirname, "fila.json");
const productsFile = path.join(__dirname, "products.json");

const productsCache = {
  items: null,
  source: null,
  updatedAt: null,
  expiresAt: null,
  lastError: null
};

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
    return JSON.parse(raw);
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

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && Number(item.qty) > 0 && Number(item.price) > 0)
    .map((item) => ({
      id: item.id,
      nome: String(item.name || "").trim(),
      quantidade: Number(item.qty),
      preco_unitario: Number(item.price),
      subtotal: Number((Number(item.qty) * Number(item.price)).toFixed(2))
    }));
}

function safeFileName(filePathValue) {
  return String(filePathValue || "").split(/[/\\]/).pop();
}

function getBaseUrl(req) {
  const envBaseUrl = process.env.BASE_URL;
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
}

function isCacheValid() {
  return Array.isArray(productsCache.items) &&
    productsCache.expiresAt &&
    Date.now() < productsCache.expiresAt;
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
  return (getVendedoresData().vendedores || []).filter((v) => v.ativo);
}

function pickNextVendedor() {
  const vendedores = getActiveVendedores();
  const fila = getFilaData();

  if (!vendedores.length) return null;

  const index = vendedores.findIndex(
    (v) => Number(v.id) === Number(fila.ultimo_vendedor_id)
  );

  const next = index === -1
    ? vendedores[0]
    : vendedores[(index + 1) % vendedores.length];

  saveFilaData({ ultimo_vendedor_id: next.id });
  return next;
}

/* =========================
   FIREBIRD HELPERS
========================= */

function queryFirebird(sql) {
  return new Promise((resolve, reject) => {
    Firebird.attach(dbOptions, (attachError, db) => {
      if (attachError) {
        return reject(attachError);
      }

      db.query(sql, (queryError, result) => {
        db.detach();

        if (queryError) {
          return reject(queryError);
        }

        resolve(result);
      });
    });
  });
}

function mapDbProducts(rows, baseUrl) {
  return rows.map((row) => {
    const price = Number(row.price || 0);
    const promo = Number(row.promo_price || 0);

    let finalPrice = price;
    let oldPrice = null;
    let offPct = null;

    if (promo && promo > 0 && promo < price) {
      finalPrice = promo;
      oldPrice = price;
      offPct = Math.round(((price - promo) / price) * 100);
    }

    const imageFile = safeFileName(row.image);
    const imageUrl = imageFile
      ? `${baseUrl}/assets/produtos/${imageFile}`
      : `${baseUrl}/assets/no-image.jpg`;

    return {
      id: row.id,
      name: row.name || "Produto sem nome",
      category: row.category || "Sem categoria",
      brand: row.brand || "",
      saleFormat: row.sale_format || "Unidade",
      installmentsNoInterest: Boolean(row.installments_no_interest),
      flashOffer: Boolean(row.flash_offer),
      price: finalPrice,
      oldPrice,
      offPct,
      freeShip: false,
      image: imageUrl,
      featured: false,
      description: row.description || "Produto sem descrição.",
      stock: Number(row.stock || 0)
    };
  });
}

async function fetchProductsFromDB(req) {
  const baseUrl = getBaseUrl(req);

  const rows = await queryFirebird(`
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
    ORDER BY NAME
    ROWS 1 TO 200
  `);

  return mapDbProducts(rows, baseUrl);
}

async function refreshProductsCache(req) {
  try {
    const products = await fetchProductsFromDB(req);

    productsCache.items = products;
    productsCache.source = "firebird";
    productsCache.updatedAt = new Date().toISOString();
    productsCache.expiresAt = Date.now() + CACHE_TTL_MS;
    productsCache.lastError = null;

    return {
      success: true,
      source: "firebird",
      total: products.length,
      updatedAt: productsCache.updatedAt,
      expiresAt: new Date(productsCache.expiresAt).toISOString(),
      products
    };
  } catch (error) {
    console.error("Erro Firebird:", error.message);
    productsCache.lastError = error.message;

    if (Array.isArray(productsCache.items)) {
      return {
        success: true,
        source: "cache-stale",
        warning: "Firebird offline, usando cache anterior",
        total: productsCache.items.length,
        updatedAt: productsCache.updatedAt,
        expiresAt: productsCache.expiresAt
          ? new Date(productsCache.expiresAt).toISOString()
          : null,
        products: productsCache.items
      };
    }

    const fallback = getProductsData();
    const baseUrl = getBaseUrl(req);

    const normalizedFallback = fallback.map((product) => {
      const imageFile = safeFileName(product.image);
      const isAbsolute = /^https?:\/\//i.test(String(product.image || ""));

      return {
        ...product,
        image: isAbsolute
          ? product.image
          : imageFile
          ? `${baseUrl}/assets/produtos/${imageFile}`
          : `${baseUrl}/assets/no-image.jpg`
      };
    });

    return {
      success: true,
      source: "json-fallback",
      warning: "Firebird offline, usando JSON",
      total: normalizedFallback.length,
      products: normalizedFallback
    };
  }
}

/* =========================
   ROTAS
========================= */

app.get("/", (req, res) => {
  res.send("Backend rodando");
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

/* =========================
   PRODUTOS COM CACHE
========================= */

app.get("/api/products", async (req, res) => {
  try {
    if (isCacheValid()) {
      return res.json({
        success: true,
        source: "cache",
        total: productsCache.items.length,
        updatedAt: productsCache.updatedAt,
        expiresAt: new Date(productsCache.expiresAt).toISOString(),
        products: productsCache.items
      });
    }

    const result = await refreshProductsCache(req);
    return res.json(result);
  } catch (error) {
    console.error("Erro /api/products:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos"
    });
  }
});

/* =========================
   STATUS / REFRESH CACHE
========================= */

app.get("/api/cache/status", (req, res) => {
  res.json({
    success: true,
    cache: {
      valid: isCacheValid(),
      source: productsCache.source,
      updatedAt: productsCache.updatedAt,
      expiresAt: productsCache.expiresAt
        ? new Date(productsCache.expiresAt).toISOString()
        : null,
      total: Array.isArray(productsCache.items) ? productsCache.items.length : 0,
      lastError: productsCache.lastError
    }
  });
});

app.post("/api/cache/refresh", async (req, res) => {
  try {
    const result = await refreshProductsCache(req);
    res.json({
      ...result,
      refreshed: true
    });
  } catch (error) {
    console.error("Erro /api/cache/refresh:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar cache"
    });
  }
});

/* =========================
   PRODUTOS FIREBIRD DIRETO
========================= */

app.get("/api/products-db", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 100));
    const offset = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();

    const baseUrl = getBaseUrl(req);
    const where = [];

    if (search) {
      const safeSearch = search.replace(/'/g, "''");
      where.push(`(
        NAME CONTAINING '${safeSearch}'
        OR CATEGORY CONTAINING '${safeSearch}'
        OR DESCRIPTION CONTAINING '${safeSearch}'
      )`);
    }

    if (category && category !== "Todos") {
      const safeCategory = category.replace(/'/g, "''");
      where.push(`CATEGORY CONTAINING '${safeCategory}'`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await queryFirebird(`
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
      ${whereSql}
      ORDER BY NAME
      ROWS ${offset + 1} TO ${offset + limit}
    `);

    const countRows = await queryFirebird(`
      SELECT COUNT(*) AS TOTAL
      FROM BANCOSQL
      ${whereSql}
    `);

    const total = Number(countRows?.[0]?.total || 0);
    const products = mapDbProducts(rows, baseUrl);

    res.json({
      success: true,
      source: "firebird",
      page,
      limit,
      total,
      hasMore: offset + products.length < total,
      search,
      category,
      products
    });
  } catch (error) {
    console.error("Erro em /api/products-db:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos do Firebird.",
      details: String(error.message || error)
    });
  }
});

/* =========================
   LEADS
========================= */

app.post("/distribuir-lead", (req, res) => {
  try {
    const vendedor = pickNextVendedor();

    if (!vendedor) {
      return res.status(500).json({
        success: false,
        message: "Nenhum vendedor ativo disponível."
      });
    }

    const telefoneVendedor = vendedor.telefone;

    if (!telefoneVendedor) {
      return res.status(500).json({
        success: false,
        message: "Vendedor sem telefone."
      });
    }

    const lead = {
      created_at: new Date().toISOString(),
      cliente: req.body.name,
      telefone: normalizePhone(req.body.phone),
      email: req.body.email || "",
      entrega: req.body.deliveryType || "",
      endereco: req.body.address || "",
      complemento: req.body.complement || "",
      cep: req.body.zip || "",
      pagamento: req.body.paymentMethod || "",
      observacoes: req.body.notes || "",
      subtotal: Number(req.body.subtotal || 0),
      frete: req.body.shipping === "R$150,00" ? 0 : Number(req.body.shipping || 0),
      total: Number(req.body.total || 0),
      itens: sanitizeItems(req.body.items),
      vendedor,
      reutilizar_mesmo_vendedor: REUTILIZAR_MESMO_VENDEDOR
    };

    const leads = getLeadsData();
    leads.leads.push(lead);
    saveLeadsData(leads);

    const itensTexto = lead.itens.length
      ? lead.itens
          .map(item => `- ${item.nome} x${item.quantidade} — R$ ${item.preco_unitario.toFixed(2)}`)
          .join("\n")
      : "- Nenhum item informado";

    const formaRecebimento =
      lead.entrega === "pickup" || lead.entrega === "Retirada"
        ? "Retirada na loja"
        : "Entrega";

    const enderecoTexto =
      formaRecebimento.includes("Retirada")
        ? "Retirada na loja"
        : [
            lead.endereco,
            lead.complemento,
            lead.cep ? `📍 CEP: ${lead.cep}` : ""
          ]
            .filter(Boolean)
            .join(" | ");

    const mensagem = `*NOVO ORÇAMENTO*

*Cliente:* ${lead.cliente}
*Telefone:* ${lead.telefone}
*E-mail:* ${lead.email || "Não informado"}

*ITENS:*
${itensTexto}

*Subtotal:* R$ ${lead.subtotal.toFixed(2)}
*Total:* R$ ${lead.total.toFixed(2)}

${formaRecebimento}
*Endereço:* ${enderecoTexto || "Não informado"}

*Pagamento:* ${lead.pagamento || "Não informado"}

*Observações:* ${lead.observacoes || "Nenhuma"}

*Cliente aguardando retorno*`;

    const whatsappLink = `https://wa.me/${telefoneVendedor}?text=${encodeURIComponent(mensagem)}`;

    return res.json({
      success: true,
      vendedor,
      whatsapp_url: whatsappLink
    });
  } catch (error) {
    console.error("Erro em /distribuir-lead:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao distribuir lead."
    });
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

setInterval(async () => {
  try {
    const fakeReq = {
      protocol: process.env.BASE_URL ? process.env.BASE_URL.split("://")[0] : "https",
      get: (header) => {
        if (header === "host") {
          if (process.env.BASE_URL) {
            return process.env.BASE_URL.replace(/^https?:\/\//, "");
          }
          return `localhost:${PORT}`;
        }
        return "";
      }
    };

    await refreshProductsCache(fakeReq);
    console.log("Cache de produtos atualizado automaticamente.");
  } catch (error) {
    console.error("Erro ao atualizar cache automaticamente:", error.message);
  }
}, CACHE_TTL_MS);
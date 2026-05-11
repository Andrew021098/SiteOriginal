require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Firebird = require("node-firebird");

const app = express();
const PORT = process.env.PORT || 3000;

const REUTILIZAR_MESMO_VENDEDOR = true; // Configuração para reutilizar o mesmo vendedor enquanto ele estiver ativo
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

console.log("FIREBIRD_HOST:", process.env.FIREBIRD_HOST);
console.log("FIREBIRD_USER:", process.env.FIREBIRD_USER);
console.log("FIREBIRD_PASSWORD existe?", Boolean(process.env.FIREBIRD_PASSWORD));
console.log("FIREBIRD_DATABASE:", process.env.FIREBIRD_DATABASE);

const firebirdOptions = {
  host: process.env.FIREBIRD_HOST,
  port: Number(process.env.FIREBIRD_PORT || 3050),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-api-key"]
}));

app.use(express.json());

app.use("/assets", express.static(path.join(__dirname, "../assets")));

const vendedoresFile = path.join(__dirname, "vendedores.json");
const leadsFile = path.join(__dirname, "leads.json");
const filaFile = path.join(__dirname, "fila.json");
const productsFile = path.join(__dirname, "products.json");

/* =========================
   UTILITÁRIOS
========================= */

app.get("/api/image", async (req, res) => {
  const query = req.query.q;

  try {
    const response = await fetch(`https://api.pexels.com/v1/search?query=${query}&per_page=1`, {
      headers: {
        Authorization: process.env.PEXELS_API_KEY
      }
    });

    const data = await response.json();

    if (!data.photos || data.photos.length === 0) {
      return res.json({ image: null });
    }

    return res.json({
      image: data.photos[0].src.medium
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar imagem" });
  }
});

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
    .filter((item) => item && Number(item.qty) > 0 && Number(item.price) >= 0)
    .map((item) => ({
      id: item.id,
      nome: String(item.name || "").trim(),
      quantidade: Number(item.qty),
      preco_unitario: Number(item.price),
      subtotal: Number((Number(item.qty) * Number(item.price)).toFixed(2))
    }));
}

function normalizeProduct(product, baseUrl) {
  const imageValue = String(product.image || "").trim();
  const isAbsolute = /^https?:\/\//i.test(imageValue);

  // 🔥 versão dinâmica pra evitar cache
  const version = Date.now();

  let finalImage = `${baseUrl}/assets/produtos/no-image.jpg?v=${version}`;

  if (imageValue) {
    if (isAbsolute) {
      finalImage = `${imageValue}?v=${version}`;
    } else if (imageValue.startsWith("/assets/")) {
      finalImage = `${baseUrl}${imageValue}?v=${version}`;
    } else if (imageValue.startsWith("./assets/")) {
      finalImage = `${baseUrl}${imageValue.replace(".", "")}?v=${version}`;
    } else {
      const fileName = imageValue.split(/[/\\]/).pop();
      finalImage = `${baseUrl}/assets/produtos/${fileName}?v=${version}`;
    }
  }

  return {
    id: product.id,
    name: product.name || "Produto sem nome",
    category: product.category || "Sem categoria",
    brand: product.brand || "",
    saleFormat: product.saleFormat || "Unidade",
    installmentsNoInterest: Boolean(product.installmentsNoInterest),
    flashOffer: Boolean(product.flashOffer),
    price: Number(product.price || 0),
    oldPrice: product.oldPrice != null ? Number(product.oldPrice) : null,
    offPct: product.offPct != null ? Number(product.offPct) : null,
    freeShip: Boolean(product.freeShip),
    image: finalImage,
    featured: Boolean(product.featured),
    description: product.description || "Produto sem descrição.",
    stock: product.stock != null ? Number(product.stock) : 0
  };
}

function getBaseUrl(req) {
  const envBaseUrl = process.env.BASE_URL;
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function parseMoney(value) {
  if (value == null || value === "") return null;

  const normalized = String(value)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function buildImagePath(foto) {
  const raw = String(foto || "").trim();

  if (!raw) return "/assets/no-image.jpg";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/assets/")) return raw;
  if (raw.startsWith("./assets/")) return raw.replace(".", "");

  const fileName = raw.split(/[/\\]/).pop();
  return `/assets/produtos/${fileName}`;
}

/* =========================
   LEITURA / ESCRITA
========================= */

function getVendedoresData() {
  const data = readJson(vendedoresFile, { vendedores: [] });
  if (Array.isArray(data)) return { vendedores: data };
  return { vendedores: Array.isArray(data.vendedores) ? data.vendedores : [] };
}

function getLeadsData() {
  const data = readJson(leadsFile, { leads: [] });
  if (Array.isArray(data)) return { leads: data };
  return { leads: Array.isArray(data.leads) ? data.leads : [] };
}

function getFilaData() {
  const data = readJson(filaFile, { ultimo_vendedor_id: 0 });
  return {
    ultimo_vendedor_id: Number(data.ultimo_vendedor_id || 0)
  };
}

function getProductsData() {
  const data = readJson(productsFile, []);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.products)) return data.products;
  return [];
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
  return (getVendedoresData().vendedores || [])
    .filter((v) => v && v.ativo)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
}

function pickNextVendedor() {
  const vendedores = getActiveVendedores();
  const fila = getFilaData();

  if (!vendedores.length) return null;

  if (REUTILIZAR_MESMO_VENDEDOR && fila.ultimo_vendedor_id) {
    const mesmo = vendedores.find(
      (v) => Number(v.id) === Number(fila.ultimo_vendedor_id)
    );
    if (mesmo) return mesmo;
  }

  const index = vendedores.findIndex(
    (v) => Number(v.id) === Number(fila.ultimo_vendedor_id)
  );

  const next =
    index === -1
      ? vendedores[0]
      : vendedores[(index + 1) % vendedores.length];

  saveFilaData({ ultimo_vendedor_id: next.id });
  return next;
}

/* =========================
   MIDDLEWARE INTERNO
========================= */

function requireInternalApiKey(req, res, next) {
  if (!INTERNAL_SECRET) {
    return res.status(500).json({
      success: false,
      message: "INTERNAL_SECRET não configurado no .env"
    });
  }

  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== INTERNAL_SECRET) {
    return res.status(403).json({
      success: false,
      message: "Acesso negado."
    });
  }

  next();
}

/* =========================
   FIREBIRD HELPERS
========================= */

function firebirdQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    Firebird.attach(firebirdOptions, (attachErr, db) => {
      if (attachErr) {
        return reject(attachErr);
      }

      db.query(sql, params, (queryErr, result) => {
        db.detach();

        if (queryErr) {
          return reject(queryErr);
        }

        resolve(result || []);
      });
    });
  });
}

function mapFirebirdRowToProduct(row) {
  const id = String(row.CDPRODUTO || "").trim();
  const name = String(row.PRODUTO || "").trim();
  const category = String(row.GRUPOS || "Sem categoria").trim();

  const oldPriceRaw = parseMoney(row.PADRAO);
  const promoPriceRaw = parseMoney(row.PROMOCAO);

  const price =
    promoPriceRaw != null && promoPriceRaw > 0
      ? promoPriceRaw
      : oldPriceRaw != null
      ? oldPriceRaw
      : 0;

  const oldPrice =
    oldPriceRaw != null &&
    promoPriceRaw != null &&
    oldPriceRaw > promoPriceRaw
      ? oldPriceRaw
      : null;

  const offPct =
    oldPrice != null && price > 0 && oldPrice > price
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : null;

  let description = "Produto sem descrição.";
  if (
    typeof row.DESCRICAO_PRODUTO === "string" &&
    row.DESCRICAO_PRODUTO.trim()
  ) {
    description = row.DESCRICAO_PRODUTO.trim();
  }

  return {
    id,
    name,
    category,
    brand: "",
    saleFormat: "Unidade",
    installmentsNoInterest: false,
    flashOffer: Boolean(offPct && offPct > 0),
    price: Number(price || 0),
    oldPrice,
    offPct,
    freeShip: false,
    image: buildImagePath(row.FOTO),
    featured: false,
    description,
    stock: Number(row.QTDEATUAL || 0)
  };
}

/* =========================
   ROTAS BÁSICAS
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
   QUANTIDADES DE PRODUTOS NO CATALOGO
========================= */

app.get("/api/categories", (req, res) => {
  try {
    const products = getProductsData();

    const counts = new Map();

    products.forEach((product) => {
      const category = String(product.category || "").trim();
      if (!category) return;

      counts.set(category, (counts.get(category) || 0) + 1);
    });

    const categories = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }))
      .map(([name, count]) => ({
        name,
        count
      }));

    return res.json({
      success: true,
      total: products.length,
      categories
    });
  } catch (error) {
    console.error("Erro em /api/categories:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar categorias."
    });
  }
});

/* =========================
   PRODUTOS VIA JSON (PÚBLICO)
========================= */

app.get("/api/products", (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 100));
    const offset = (page - 1) * limit;

    const search = String(req.query.search || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();

    const baseUrl = getBaseUrl(req);

    let products = getProductsData().map((product) =>
      normalizeProduct(product, baseUrl)
    );

    if (search) {
      products = products.filter((product) => {
        return (
          String(product.name || "").toLowerCase().includes(search) ||
          String(product.category || "").toLowerCase().includes(search) ||
          String(product.description || "").toLowerCase().includes(search) ||
          String(product.brand || "").toLowerCase().includes(search)
        );
      });
    }

    if (category && category !== "Todos") {
      products = products.filter(
        (product) =>
          String(product.category || "").toLowerCase() === category.toLowerCase()
      );
    }

    const total = products.length;
    const paginated = products.slice(offset, offset + limit);

    return res.json({
      success: true,
      source: "json",
      page,
      limit,
      total,
      hasMore: offset + paginated.length < total,
      search,
      category,
      products: paginated
    });
  } catch (error) {
    console.error("Erro em /api/products:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos do JSON."
    });
  }
});

/* =========================
   PRODUTOS VIA FIREBIRD (PRIVADO)
   USADO SÓ PELO export-csv.js
========================= */

app.get("/api/products-db", requireInternalApiKey, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 1000));
    const offset = (page - 1) * limit;

    const search = String(req.query.search || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim().toLowerCase();

    const sql = `
  SELECT
    CDPRODUTO,
    PRODUTO,
    FOTO,
    DESCRICAO_PRODUTO,
    GRUPOS,
    QTDEATUAL,
    PADRAO,
    PROMOCAO
  FROM BANCOSQL
`;

    const rows = await firebirdQuery(sql);
    console.log("COLUNAS REAIS DA VIEW:", rows);
    let products = rows
       .map(mapFirebirdRowToProduct)
       .filter((product) => product.name);

    if (search) {
      products = products.filter((product) =>
        String(product.name || "").toLowerCase().includes(search) ||
        String(product.category || "").toLowerCase().includes(search) ||
        String(product.description || "").toLowerCase().includes(search)
      );
    }

    if (category && category !== "todos") {
      products = products.filter(
        (product) => String(product.category || "").toLowerCase() === category
      );
    }

    const total = products.length;
    const paginated = products.slice(offset, offset + limit);

    return res.json({
      success: true,
      source: "firebird",
      page,
      limit,
      total,
      hasMore: offset + paginated.length < total,
      search,
      category,
      products: paginated
    });
  } catch (error) {
    console.error("Erro em /api/products-db:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos do Firebird."
    });
  }
});

/* =========================
   LEADS / WHATSAPP
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
      frete: Number(req.body.shipping || 0),
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
          .map(
            (item) =>
              `- ${item.nome} x${item.quantidade} — R$ ${item.preco_unitario.toFixed(2)}`
          )
          .join("\n")
      : "- Nenhum item informado";

    const formaRecebimento =
      lead.entrega === "pickup" || lead.entrega === "Retirada"
        ? "Retirada na loja"
        : "Entrega";

    const enderecoTexto =
      formaRecebimento.includes("Retirada")
        ? "Retirada na loja"
        : [lead.endereco, lead.complemento, lead.cep ? `"" CEP: ${lead.cep}` : ""]
            .filter(Boolean)
            .join(" | ");

    const mensagem = `*NOVO ORÇAMENTO*

*Cliente:* ${lead.cliente}
*Telefone:* ${lead.telefone}
*E-mail:* ${lead.email || "Não informado"}

*ITENS:*
${itensTexto}

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
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
  host: "192.168.88.225",
  port: 3050,
  database: "C:\\CAMINHO\\SEU_BANCO.fdb", // AJUSTAR
  user: "SYSDBA",
  password: "masterkey",
  lowercase_keys: true
};

/* =========================
   CONFIG
========================= */

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
    .filter(item => item && Number(item.qty) > 0 && Number(item.price) > 0)
    .map(item => ({
      id: item.id,
      nome: String(item.name || "").trim(),
      quantidade: Number(item.qty),
      preco_unitario: Number(item.price),
      subtotal: Number((Number(item.qty) * Number(item.price)).toFixed(2))
    }));
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
  return (getVendedoresData().vendedores || []).filter(v => v.ativo);
}

function pickNextVendedor() {
  const vendedores = getActiveVendedores();
  const fila = getFilaData();

  if (!vendedores.length) return null;

  const index = vendedores.findIndex(v => Number(v.id) === Number(fila.ultimo_vendedor_id));
  const next = index === -1 ? vendedores[0] : vendedores[(index + 1) % vendedores.length];

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

function mapDbProducts(rows) {
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

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      price: finalPrice,
      oldPrice,
      offPct,
      freeShip: false,
      image: row.image
        ? `/assets/produtos/${String(row.image).split("\\").pop()}`
        : "/assets/no-image.jpg",
      featured: false,
      description: row.description,
      stock: Number(row.stock || 0)
    };
  });
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
   PRODUTOS JSON (SITE SEGUE FUNCIONANDO)
========================= */

app.get("/api/products", (req, res) => {
  try {
    const products = getProductsData();

    res.json({
      success: true,
      source: "json",
      total: products.length,
      products
    });
  } catch (error) {
    console.error("Erro em /api/products:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao carregar produtos do JSON."
    });
  }
});

/* =========================
   PRODUTOS FIREBIRD (TESTE)
========================= */

app.get("/api/products-db", async (req, res) => {
  try {
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
    `);

    const products = mapDbProducts(rows);

    res.json({
      success: true,
      source: "firebird",
      total: products.length,
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

    const lead = {
      created_at: new Date().toISOString(),
      cliente: req.body.name,
      telefone: normalizePhone(req.body.phone),
      itens: sanitizeItems(req.body.items),
      vendedor,
      reutilizar_mesmo_vendedor: REUTILIZAR_MESMO_VENDEDOR
    };

    const leads = getLeadsData();
    leads.leads.push(lead);
    saveLeadsData(leads);

    res.json({
      success: true,
      vendedor
    });
  } catch (error) {
    console.error("Erro em /distribuir-lead:", error);
    res.status(500).json({
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
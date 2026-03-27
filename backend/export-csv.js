require("dotenv").config();
const fs = require("fs");

const BASE_URL = process.env.PRODUCTS_DB_URL || "http://localhost:3000/api/products-db";
const API_KEY = process.env.INTERNAL_SECRET || "";
const LIMIT = Number(process.env.EXPORT_LIMIT || 1000);
const OUTPUT = "./products.csv";

async function fetchPage(page) {
  const url = `${BASE_URL}?page=${page}&limit=${LIMIT}`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": API_KEY
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erro HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data;
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeMoney(value) {
  if (value == null || value === "") return "";

  const cleaned = String(value)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const num = Number(cleaned);
  return Number.isFinite(num) ? num.toFixed(2) : "";
}

function toCSV(products) {
  const headers = [
    "id",
    "name",
    "category",
    "brand",
    "saleFormat",
    "installmentsNoInterest",
    "flashOffer",
    "price",
    "oldPrice",
    "offPct",
    "freeShip",
    "image",
    "featured",
    "description",
    "stock"
  ];

  const lines = products.map((p) => [
    p.id ?? "",
    escapeCsv(p.name),
    escapeCsv(p.category),
    escapeCsv(p.brand),
    escapeCsv(p.saleFormat),
    p.installmentsNoInterest ?? false,
    p.flashOffer ?? false,
    normalizeMoney(p.price),
    normalizeMoney(p.oldPrice),
    p.offPct ?? "",
    p.freeShip ?? false,
    escapeCsv(p.image),
    p.featured ?? false,
    escapeCsv(p.description),
    p.stock ?? 0
  ].join(";"));

  return [headers.join(";"), ...lines].join("\n");
}

async function run() {
  if (!API_KEY) {
    throw new Error("INTERNAL_SECRET não definido no .env");
  }

  let page = 1;
  let allProducts = [];

  console.log("🚀 Iniciando exportação Firebird → CSV");

  while (true) {
    const data = await fetchPage(page);
    const products = Array.isArray(data.products) ? data.products : [];

    console.log(`📦 Página ${page} → ${products.length} produtos`);

    allProducts = allProducts.concat(products);

    if (!data.hasMore) break;
    page++;
  }

  console.log(`✅ Total coletado: ${allProducts.length}`);

  const csv = toCSV(allProducts);
  fs.writeFileSync(OUTPUT, csv, "utf8");

  console.log(`📁 CSV salvo em: ${OUTPUT}`);
}

run().catch((err) => {
  console.error("❌ Erro na exportação:", err.message);
  process.exit(1);
});
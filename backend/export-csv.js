const fs = require("fs");

const BASE_URL = "http://localhost:3000/api/products-db";
const LIMIT = 1000; // pega 1000 por vez (evita travar)
const OUTPUT = "./products.csv";

async function fetchPage(page) {
  const url = `${BASE_URL}?page=${page}&limit=${LIMIT}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Erro HTTP: ${res.status}`);
  }

  const data = await res.json();
  return data;
}

function toCSV(products) {
  const headers = [
    "id",
    "name",
    "category",
    "brand",
    "price",
    "oldPrice",
    "stock",
    "description"
  ];

  const lines = products.map(p => [
    p.id,
    `"${(p.name || "").replace(/"/g, '""')}"`,
    `"${(p.category || "").replace(/"/g, '""')}"`,
    `"${(p.brand || "").replace(/"/g, '""')}"`,
    p.price ?? "",
    p.oldPrice ?? "",
    p.stock ?? "",
    `"${(p.description || "").replace(/"/g, '""')}"`
  ].join(";"));

  return [headers.join(";"), ...lines].join("\n");
}

async function run() {
  let page = 1;
  let allProducts = [];

  console.log("🚀 Iniciando exportação...");

  while (true) {
    const data = await fetchPage(page);

    console.log(`📦 Página ${page} → ${data.products.length} produtos`);

    allProducts = allProducts.concat(data.products);

    if (!data.hasMore) break;

    page++;
  }

  console.log(`✅ Total coletado: ${allProducts.length}`);

  const csv = toCSV(allProducts);

  fs.writeFileSync(OUTPUT, csv, "utf8");

  console.log(`📁 CSV salvo em: ${OUTPUT}`);
}

run().catch(err => {
  console.error("❌ Erro:", err.message);
});
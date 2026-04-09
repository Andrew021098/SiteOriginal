require("dotenv").config();
const fs = require("fs");

const products = JSON.parse(fs.readFileSync("./products.json", "utf8"));

function normalizeQuery(name) {
  return String(name || "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchImage(query) {
  const safeQuery = encodeURIComponent(String(query || "").trim());

  const res = await fetch(`https://api.pexels.com/v1/search?query=${safeQuery}&per_page=1`, {
    headers: {
      Authorization: process.env.PEXELS_API_KEY
    }
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Erro HTTP ${res.status} para "${query}"`);
    console.error(errorText.slice(0, 300));
    return null;
  }

  if (!contentType.includes("application/json")) {
    const html = await res.text();
    console.error(`Resposta não é JSON para "${query}"`);
    console.error(html.slice(0, 300));
    return null;
  }

  const data = await res.json();
  return data.photos?.[0]?.src?.medium || null;
}

async function run() {
  for (let product of products.slice(0, 20)) {
    try {
      const query = normalizeQuery(product.name);
      console.log("Buscando:", query);

      const img = await fetchImage(query);

      if (img) {
        product.image = img;
      }

    } catch (error) {
      console.error(`Erro ao processar "${product.name}":`, error.message);
    }
  }

  fs.writeFileSync("./products.json", JSON.stringify(products, null, 2), "utf8");
  console.log("🔥 Imagens atualizadas!");
}


run();
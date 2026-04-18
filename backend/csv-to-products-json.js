const fs = require("fs");
const path = require("path");

const CSV_FILE = path.join(__dirname, "products.csv");
const JSON_FILE = path.join(__dirname, "backend", "products.json");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ";" && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;

  const normalized = String(value)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  return toNumber(value, null);
}

function toBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeImage(imageValue, id) {
  const value = String(imageValue || "").trim();

  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/assets/")) return value;
  if (value.startsWith("./assets/")) return value.replace(".", "");

  // 🔥 se vier vazio, usa o ID como nome da imagem
  if (!value && id) {
    return `/assets/produtos/${id}.jpg`;
  }

  return "/assets/produtos/no-image.jpg";
}

function buildOffPct(price, oldPrice) {
  if (!oldPrice || !price || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function run() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Arquivo não encontrado: ${CSV_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_FILE, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    console.error("CSV vazio.");
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  const products = lines
    .slice(1)
    .map((line) => {
      const cols = parseCsvLine(line);

      const row = {};
      headers.forEach((header, index) => {
        row[header] = cols[index] ?? "";
      });

      const price = toNumber(row.price, 0);
      const oldPrice = toNullableNumber(row.oldPrice);
      const offPct =
        row.offPct !== undefined && row.offPct !== ""
          ? toNullableNumber(row.offPct)
          : buildOffPct(price, oldPrice);

      return {
        id: String(row.id || "").trim(),
        name: String(row.name || "").trim(),
        category: String(row.category || "Sem categoria").trim(),
        brand: String(row.brand || "").trim(),
        saleFormat: String(row.saleFormat || "Unidade").trim(),
        installmentsNoInterest: toBoolean(row.installmentsNoInterest),
        flashOffer: toBoolean(row.flashOffer),
        price,
        oldPrice,
        offPct,
        freeShip: toBoolean(row.freeShip),
        image: normalizeImage(row.image, row.id),
        featured: toBoolean(row.featured),
        description: String(row.description || "Produto sem descrição.").trim(),
        stock: toNumber(row.stock, 0)
      };
    })
    .filter((product) => product.name);

  fs.writeFileSync(JSON_FILE, JSON.stringify(products, null, 2), "utf8");

  console.log(`✅ ${products.length} produtos convertidos para products.json`);
  console.log(`📁 Arquivo gerado em: ${JSON_FILE}`);
}

run();
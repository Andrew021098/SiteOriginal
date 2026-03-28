const fs = require("fs");

const csv = fs.readFileSync("./products.csv", "utf8");

function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  const headers = lines[0].split(";").map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ";" && !insideQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current);

    const obj = {};
    headers.forEach((header, i) => {
      let value = values[i] ?? "";
      value = value.replace(/^"|"$/g, "").replace(/""/g, '"');
      obj[header] = value;
    });

    return obj;
  });
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isNaN(number) ? fallback : number;
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isNaN(number) ? null : number;
}

function toBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;

  const normalized = String(value).trim().toLowerCase();

  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "sim"
  );
}

const parsed = parseCSV(csv);

const products = parsed.map(p => ({
  id: toNumber(p.id),
  name: p.name || "Produto sem nome",
  category: p.category || "Sem categoria",
  brand: p.brand || "",
  saleFormat: p.saleFormat || "Unidade",
  installmentsNoInterest: toBoolean(p.installmentsNoInterest, false),
  flashOffer: toBoolean(p.flashOffer, false),
  price: toNumber(p.price, 0),
  oldPrice: toNullableNumber(p.oldPrice),
  offPct: toNullableNumber(p.offPct),
  freeShip: toBoolean(p.freeShip, false),
  image: p.image || "/assets/produtos/no-image.jpg",
  featured: toBoolean(p.featured, false),
  description: p.description || "Produto sem descrição.",
  stock: toNumber(p.stock, 0)
})).filter(p => p.id || p.name);

fs.writeFileSync(
  "./products.json",
  JSON.stringify(products, null, 2),
  "utf8"
);

console.log(`✅ ${products.length} produtos convertidos`);
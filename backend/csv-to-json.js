const fs = require("fs");

const csv = fs.readFileSync("./products.csv", "utf8");

const lines = csv.split("\n");

// remove cabeçalho
const headers = lines[0].split(";");

const products = lines.slice(1).map(line => {
  const values = line.split(";");

  if (values.length < headers.length) return null;

  return {
    id: Number(values[0]),
    name: values[1].replace(/"/g, ""),
    category: values[2].replace(/"/g, ""),
    brand: values[3].replace(/"/g, ""),
    price: Number(values[4]) || 0,
    oldPrice: values[5] ? Number(values[5]) : null,
    stock: Number(values[6]) || 0,
    description: values[7]?.replace(/"/g, "") || ""
  };
}).filter(Boolean);

fs.writeFileSync(
  "./products.json",
  JSON.stringify(products, null, 2),
  "utf8"
);

console.log(`✅ ${products.length} produtos convertidos`);
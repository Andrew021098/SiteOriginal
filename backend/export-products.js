const fs = require("fs");

async function run() {
  const res = await fetch("http://localhost:3000/api/products-db");
  const data = await res.json();

  fs.writeFileSync(
    "./products.json",
    JSON.stringify(data.products, null, 2),
    "utf8"
  );

  console.log(`✅ Exportados ${data.products.length} produtos`);
}

run();
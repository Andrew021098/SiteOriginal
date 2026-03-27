require("dotenv").config();
const Firebird = require("node-firebird");

const options = {
  host: process.env.FIREBIRD_HOST,
  port: Number(process.env.FIREBIRD_PORT || 3050),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

console.log("HOST:", options.host);
console.log("PORT:", options.port);
console.log("DATABASE:", options.database);
console.log("USER:", options.user);
console.log("PASSWORD existe?", Boolean(options.password));

Firebird.attach(options, (err, db) => {
  if (err) {
    console.error("❌ Erro ao conectar:", err);
    process.exit(1);
  }

  console.log("✅ Conectado com sucesso no Firebird");

  db.query("SELECT 1 AS TESTE FROM RDB$DATABASE", (queryErr, result) => {
    if (queryErr) {
      console.error("❌ Erro ao consultar:", queryErr);
      db.detach();
      process.exit(1);
    }

    console.log("✅ Query OK:", result);
    db.detach();
    process.exit(0);
  });
});
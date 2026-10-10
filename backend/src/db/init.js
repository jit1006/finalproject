// Initialize the SQLite database: apply schema.sql then seed.sql.
// Usage: npm run db:init   (set PRMS_DATABASE_FILE to choose the file)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./connection.js";

const here = dirname(fileURLToPath(import.meta.url));

function applyFile(name) {
  const sql = readFileSync(join(here, name), "utf8");
  db.exec(sql);
  console.log(`applied ${name}`);
}

applyFile("schema.sql");
applyFile("seed.sql");
console.log("Database initialized.");

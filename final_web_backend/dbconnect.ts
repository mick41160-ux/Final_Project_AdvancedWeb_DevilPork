import "dotenv/config";
import { createPool } from "mysql2/promise";

export const conn = createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST?.replace(/^\uFEFF/, "").trim(),
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER?.replace(/^\uFEFF/, "").trim(),
  password: process.env.DB_PASSWORD?.replace(/^\uFEFF/, "").trim(),
  database: process.env.DB_NAME?.replace(/^\uFEFF/, "").trim(),
  waitForConnections: true,
  ssl:
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: process.env.DB_SSL_VERIFY === "true" }
      : undefined,
});

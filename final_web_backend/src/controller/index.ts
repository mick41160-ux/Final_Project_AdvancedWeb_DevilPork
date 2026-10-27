import express from "express";
import { conn } from "../../db";
export const router = express.Router();
router.get("/", (_q, r) => r.json({ name: "Final Web Project API" }));

router.get("/health", async (_q, r) => {
  try {
    await conn.query("SELECT 1");
    r.json({ ok: true, database: "mysql" });
  } catch (error: any) {
    console.error("Database health check failed:", error);
    r.status(503).json({
      ok: false,
      error: error?.message || "Database connection failed",
    });
  }
});

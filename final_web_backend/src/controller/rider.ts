import express from "express";
import { conn } from "../../dbconnect";
export const router = express.Router();

router.get("/", async (_q, res) => {
  try {
    const [r] = await conn.query("SELECT * FROM RIDERS");
    res.json(r);
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

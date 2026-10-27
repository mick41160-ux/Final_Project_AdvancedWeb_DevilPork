import express from "express";
import { conn } from "../../db";
export const router = express.Router();

router.get("/", async (_q, res) => {
  try {
    const [r] = await conn.query("SELECT * FROM RIDERS");
    res.json(r);
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/", async (req, res) => {
  const { display_name, phone, is_available = true } = req.body ?? {};
  if (typeof display_name !== "string" || !display_name.trim() || display_name.length > 120
    || typeof phone !== "string" || !phone.trim() || phone.length > 20
    || typeof is_available !== "boolean") {
    return res.status(400).json({ error: "Invalid rider data" });
  }
  try {
    const [result] = await conn.query(
      "INSERT INTO RIDERS(display_name, phone, is_available) VALUES (?, ?, ?)",
      [display_name.trim(), phone.trim(), is_available],
    );
    res.status(201).json({ last_id: (result as any).insertId });
  } catch (error: any) {
    console.error("Rider creation failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.put("/:id", async (req, res) => {
  const { display_name, phone, is_available } = req.body ?? {};
  if ((display_name !== undefined && (typeof display_name !== "string" || !display_name.trim() || display_name.length > 120))
    || (phone !== undefined && (typeof phone !== "string" || !phone.trim() || phone.length > 20))
    || (is_available !== undefined && typeof is_available !== "boolean")
    || (display_name === undefined && phone === undefined && is_available === undefined)) {
    return res.status(400).json({ error: "Invalid rider update" });
  }
  try {
    const [result] = await conn.query(
      `UPDATE RIDERS SET display_name = COALESCE(?, display_name),
       phone = COALESCE(?, phone), is_available = COALESCE(?, is_available) WHERE id = ?`,
      [display_name?.trim() ?? null, phone?.trim() ?? null, is_available ?? null, req.params.id],
    );
    if (!(result as any).affectedRows) return res.status(404).json({ error: "Rider not found" });
    res.json({ affected_rows: (result as any).affectedRows });
  } catch (error: any) {
    console.error("Rider update failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await conn.query("DELETE FROM RIDERS WHERE id = ?", [req.params.id]);
    if (!(result as any).affectedRows) return res.status(404).json({ error: "Rider not found" });
    res.json({ affected_rows: (result as any).affectedRows });
  } catch (error: any) {
    console.error("Rider deletion failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

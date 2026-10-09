import express from "express";
import { conn } from "../../dbconnect";
export const router = express.Router();

router.get("/", async (_q, res) => {
  try {
    const [r] = await conn.query("SELECT id, customer_id, box_count, status, ordered_at FROM ORDERS ORDER BY id DESC");
    res.json(r);
  } catch (error: any) {
    console.error("Order query failed:", error);
    res.status(500).json({ error: error?.message || "Database error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const [r] = await conn.query(
      "INSERT INTO ORDERS(customer_id,box_count,status) VALUES(?,?,?)",
      [req.body.customer_id, req.body.box_count, "ready"],
    );
    res.status(201).json({ last_id: (r as any).insertId });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});



router.put("/:id", async (req, res) => {
  try {
    const { customer_id, box_count, status } = req.body;
    const [result] = await conn.query("UPDATE ORDERS SET customer_id=COALESCE(?,customer_id), box_count=COALESCE(?,box_count), status=COALESCE(?,status) WHERE id=?", [customer_id ?? null, box_count ?? null, status ?? null, req.params.id]);
    if (!(result as any).affectedRows) return res.status(404).json({ error: "Order not found" });
    res.json({ affected_rows: (result as any).affectedRows });
  } catch { res.status(500).json({ error: "Database error" }); }
});

router.delete("/:id", async (req, res) => {
  try { const [result] = await conn.query("DELETE FROM ORDERS WHERE id=?", [req.params.id]); if (!(result as any).affectedRows) return res.status(404).json({ error: "Order not found" }); res.json({ affected_rows: (result as any).affectedRows }); }
  catch { res.status(500).json({ error: "Database error" }); }
});

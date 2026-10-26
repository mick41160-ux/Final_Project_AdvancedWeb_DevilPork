import express from "express";
import { conn } from "../../dbconnect";
export const router = express.Router();

router.get("/", async (_q, res) => {
  try {
    const [r] = await conn.query(`
  SELECT
    o.id,
    o.customer_id,
    o.box_count,
    o.status,
    o.ordered_at,
    c.first_name,
    c.last_name,
    c.phone,
    c.address,
    c.latitude,
    c.longitude
  FROM ORDERS AS o
  JOIN CUSTOMERS AS c ON c.id = o.customer_id
  ORDER BY o.id DESC
`);
    res.json(r);
  } catch (error: any) {
    console.error("Order query failed:", error);
    res.status(500).json({ error: error?.message || "Database error" });
  }
});

router.post("/", async (req, res) => {
  const { customer_id, box_count } = req.body;

  if (!Number.isInteger(box_count) || box_count < 1 || box_count > 3) {
    return res.status(400).json({
      error: "box_count must be an integer between 1 and 3",
    });
  }

  try {
    const [result] = await conn.query(
      "INSERT INTO ORDERS(customer_id, box_count, status) VALUES (?, ?, ?)",
      [customer_id, box_count, "ready"],
    );

    res.status(201).json({
      last_id: (result as any).insertId,
    });
  } catch (error: any) {
    console.error("Order creation failed:", error);
    res.status(500).json({
      error: error?.message || "Database error",
    });
  }
});

router.put("/:id", async (req, res) => {
  const { customer_id, box_count, status } = req.body;

  const validStatuses = [
    "pending",
    "ready",
    "assigned",
    "delivered",
    "cancelled",
  ];

  if (
    box_count !== undefined &&
    (!Number.isInteger(box_count) || box_count < 1 || box_count > 3)
  ) {
    return res.status(400).json({
      error: "box_count must be an integer between 1 and 3",
    });
  }

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid order status",
    });
  }

  try {
    const [result] = await conn.query(
      `UPDATE ORDERS
       SET customer_id = COALESCE(?, customer_id),
           box_count = COALESCE(?, box_count),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [customer_id ?? null, box_count ?? null, status ?? null, req.params.id],
    );

    const affectedRows = (result as any).affectedRows;

    if (!affectedRows) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ affected_rows: affectedRows });
  } catch (error: any) {
    console.error("Order update failed:", error);
    return res.status(500).json({
      error: error?.message || "Database error",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await conn.query("DELETE FROM ORDERS WHERE id=?", [
      req.params.id,
    ]);
    if (!(result as any).affectedRows)
      return res.status(404).json({ error: "Order not found" });
    res.json({ affected_rows: (result as any).affectedRows });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

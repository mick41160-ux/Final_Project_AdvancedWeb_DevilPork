import express from "express";
import { conn } from "../../db";
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

router.get("/nearby", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Valid latitude and longitude are required" });
  }
  try {
    const [rows] = await conn.query(
      `SELECT o.id, o.customer_id, o.box_count, o.status, o.ordered_at,
        c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude,
        ROUND(6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(c.latitude - ?) / 2), 2) +
          COS(RADIANS(?)) * COS(RADIANS(c.latitude)) *
          POWER(SIN(RADIANS(c.longitude - ?) / 2), 2)
        )), 3) AS distance_km
       FROM ORDERS o JOIN CUSTOMERS c ON c.id = o.customer_id
       WHERE o.status IN ('pending', 'ready')
       HAVING distance_km <= 2
       ORDER BY distance_km`,
      [latitude, latitude, longitude],
    );
    res.json(rows);
  } catch (error: any) {
    console.error("Nearby order query failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/", async (req, res) => {
  const { customer_id, box_count } = req.body;

  if (!Number.isSafeInteger(Number(customer_id)) || Number(customer_id) < 1) {
    return res.status(400).json({ error: "customer_id must be a positive integer" });
  }
  if (!Number.isInteger(box_count) || box_count < 1 || box_count > 3) {
    return res.status(400).json({
      error: "box_count must be an integer between 1 and 3",
    });
  }

  try {
    const [result] = await conn.query(
      "INSERT INTO ORDERS(customer_id, box_count, status) VALUES (?, ?, ?)",
      [Number(customer_id), box_count, "ready"],
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
  let connection: Awaited<ReturnType<typeof conn.getConnection>> | undefined;
  try {
    connection = await conn.getConnection();
    await connection.beginTransaction();
    const [stopRows] = await connection.query<any[]>(
      "SELECT route_id, stop_sequence FROM ROUTE_STOPS WHERE order_id = ?",
      [req.params.id],
    );
    const [result] = await connection.query("DELETE FROM ORDERS WHERE id=?", [
      req.params.id,
    ]);
    if (!(result as any).affectedRows) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found" });
    }
    for (const stop of stopRows) {
      await connection.query(
        "UPDATE ROUTE_STOPS SET stop_sequence = stop_sequence - 1 WHERE route_id = ? AND stop_sequence > ?",
        [stop.route_id, stop.stop_sequence],
      );
    }
    await connection.commit();
    res.json({ affected_rows: (result as any).affectedRows });
  } catch {
    await connection?.rollback();
    res.status(500).json({ error: "Database error" });
  } finally {
    connection?.release();
  }
});

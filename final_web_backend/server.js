require("dotenv").config();
const express = require("express");
const cors = require("cors");
const conn = require("./dbconnect");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await conn.query("SELECT 1");
    res.json({ ok: true, database: "mysql" });
  } catch (error) {
    res.status(503).json({ ok: false, error: "Database connection failed" });
  }
});

app.get("/api/customers", async (req, res) => {
  try {
    const { name = "", lat, lng, radius = 1 } = req.query;
    let sql = `SELECT * FROM customers WHERE first_name LIKE ? OR last_name LIKE ?`;
    const params = [`%${name}%`, `%${name}%`];
    if (lat != null && lng != null) {
      sql += ` AND (6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(latitude))))) <= ?`;
      params.push(Number(lat), Number(lng), Number(lat), Number(radius));
    }
    const [rows] = await conn.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const { first_name, last_name, phone, address, latitude, longitude } =
      req.body;
    if (
      !first_name ||
      !last_name ||
      !phone ||
      !address ||
      latitude == null ||
      longitude == null
    ) {
      return res
        .status(400)
        .json({ error: "Missing required customer fields" });
    }
    const [result] = await conn.query(
      "INSERT INTO customers (first_name,last_name,phone,address,latitude,longitude) VALUES (?,?,?,?,?,?)",
      [first_name, last_name, phone, address, latitude, longitude],
    );
    const [rows] = await conn.query("SELECT * FROM customers WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const [rows] =
      await conn.query(`SELECT o.*, c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude
      FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id DESC`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const { customer_id, box_count } = req.body;
    if (
      !customer_id ||
      !Number.isInteger(box_count) ||
      box_count < 1 ||
      box_count > 3
    ) {
      return res
        .status(400)
        .json({ error: "customer_id and box_count 1-3 are required" });
    }
    const [result] = await conn.query(
      "INSERT INTO orders (customer_id,box_count,status) VALUES (?,?,?)",
      [customer_id, box_count, "ready"],
    );
    const [rows] = await conn.query("SELECT * FROM orders WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const { box_count, status } = req.body;
    await conn.query(
      "UPDATE orders SET box_count = COALESCE(?,box_count), status = COALESCE(?,status) WHERE id = ?",
      [box_count, status, req.params.id],
    );
    const [rows] = await conn.query("SELECT * FROM orders WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
if (require.main === module)
  app.listen(port, () =>
    console.log(`API running on http://localhost:${port}`),
  );
module.exports = app;

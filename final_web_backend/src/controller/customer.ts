import express from "express";
import { conn } from "../../db";
export const router = express.Router();

function isValidCustomer(c: any): boolean {
  return typeof c?.first_name === "string" && c.first_name.trim().length > 0 && c.first_name.length <= 100
    && typeof c?.last_name === "string" && c.last_name.trim().length > 0 && c.last_name.length <= 100
    && typeof c?.phone === "string" && c.phone.trim().length > 0 && c.phone.length <= 20
    && typeof c?.address === "string" && c.address.trim().length > 0 && c.address.length <= 255
    && typeof c?.latitude === "number" && Number.isFinite(c.latitude) && c.latitude >= -90 && c.latitude <= 90
    && typeof c?.longitude === "number" && Number.isFinite(c.longitude) && c.longitude >= -180 && c.longitude <= 180;
}

router.get("/", async (req, res) => {
  try {
    const k = String(req.query.name || "");
    const [r] = await conn.query(
      "SELECT * FROM CUSTOMERS WHERE first_name LIKE ? OR last_name LIKE ?",
      [`%${k}%`, `%${k}%`],
    );
    res.json(r);
  } catch {
    res.status(500).json({ error: "Database error" });
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
      `SELECT c.*, ROUND(6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(c.latitude - ?) / 2), 2) +
        COS(RADIANS(?)) * COS(RADIANS(c.latitude)) *
        POWER(SIN(RADIANS(c.longitude - ?) / 2), 2)
      )), 3) AS distance_km
       FROM CUSTOMERS c
       HAVING distance_km <= 1
       ORDER BY distance_km`,
      [latitude, latitude, longitude],
    );
    res.json(rows);
  } catch (error: any) {
    console.error("Nearby customer query failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});



router.post("/", async (req, res) => {
  try {
    const c = req.body;
    if (!isValidCustomer(c)) return res.status(400).json({ error: "Invalid customer data" });
    const [r] = await conn.query(
      "INSERT INTO CUSTOMERS(first_name,last_name,phone,address,latitude,longitude) VALUES(?,?,?,?,?,?)",
      [c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude],
    );
    res.status(201).json({ last_id: (r as any).insertId });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await conn.query("SELECT * FROM CUSTOMERS WHERE id = ?", [
      req.params.id,
    ]);
    const customers = rows as any[];
    if (customers.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customers[0]);
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const c = req.body;
    if (!isValidCustomer(c)) return res.status(400).json({ error: "Invalid customer data" });
    const [r] = await conn.query(
      "UPDATE CUSTOMERS SET first_name=?,last_name=?,phone=?,address=?,latitude=?,longitude=? WHERE id=?",
      [
        c.first_name,
        c.last_name,
        c.phone,
        c.address,
        c.latitude,
        c.longitude,
        req.params.id,
      ],
    );
    if (!(r as any).affectedRows) return res.status(404).json({ error: "Customer not found" });
    res.json({ affected_rows: (r as any).affectedRows });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const [r] = await conn.query("DELETE FROM CUSTOMERS WHERE id=?", [
      req.params.id,
    ]);
    if (!(r as any).affectedRows) return res.status(404).json({ error: "Customer not found" });
    res.json({ affected_rows: (r as any).affectedRows });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

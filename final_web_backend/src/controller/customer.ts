import express from "express";
import { conn } from "../../dbconnect";
export const router = express.Router();

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



router.post("/", async (req, res) => {
  try {
    const c = req.body;
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
    res.json({ affected_rows: (r as any).affectedRows });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

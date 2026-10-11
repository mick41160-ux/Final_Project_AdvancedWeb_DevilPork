# คู่มือการใช้งาน Web API

ระบบจัดเส้นทางและแบ่งงานไรเดอร์สำหรับร้านข้าวกล่อง

โครงสร้างฐานข้อมูลอ้างอิงตาม ERD ล่าสุด ประกอบด้วย `CUSTOMERS`, `ORDERS`,
`ROUTING_RUNS`, `ROUTES`, `ROUTE_STOPS` และ `RIDERS` โดย Foreign Key
เชื่อมตามความสัมพันธ์ใน ERD ดังนี้:

- `ORDERS.customer_id` เชื่อมกับ `CUSTOMERS.id`
- `ROUTES.routing_run_id` เชื่อมกับ `ROUTING_RUNS.id`
- `ROUTES.rider_id` เชื่อมกับ `RIDERS.id`
- `ROUTE_STOPS.route_id` เชื่อมกับ `ROUTES.id`
- `ROUTE_STOPS.order_id` เชื่อมกับ `ORDERS.id`


## Base URL

Local:

```text
http://localhost:3000
```

Production:

```text
https://finalwebprojectapi.vercel.app
```

ทุก Request ที่ส่งข้อมูลต้องใช้ Header:

```http
Content-Type: application/json
```

## สรุปเส้น API ทั้งหมด

| Method | Endpoint | ใช้งาน |
|---|---|---|
| GET | `/` | ตรวจชื่อระบบ |
| GET | `/health` | ตรวจสถานะฐานข้อมูล |
| GET | `/api/customer` | แสดง/ค้นหาลูกค้า |
| POST | `/api/customer` | เพิ่มลูกค้า |
| GET | `/api/customer/:id` | ดูลูกค้าตาม ID |
| GET | `/api/customer/nearby` | ค้นหาลูกค้าใกล้ตำแหน่ง |
| PUT | `/api/customer/:id` | แก้ไขลูกค้า |
| DELETE | `/api/customer/:id` | ลบลูกค้า |
| GET | `/api/order` | แสดงออเดอร์ |
| POST | `/api/order` | เพิ่มออเดอร์ |
| GET | `/api/order/nearby` | ค้นหาออเดอร์ใกล้ตำแหน่ง |
| PUT | `/api/order/:id` | แก้ไขออเดอร์ |
| DELETE | `/api/order/:id` | ลบออเดอร์ |
| GET | `/api/rider` | แสดงไรเดอร์ |
| GET | `/api/routing/latest` | แสดงแผนเส้นทางล่าสุด |

## ตรวจสอบระบบ

### `GET /`

ตรวจชื่อระบบ

```json
{
  "name": "Final Web Project API"
}
```

### `GET /health`

ตรวจสอบว่า API เชื่อมต่อ MySQL สำเร็จหรือไม่

ตัวอย่าง Response:

```json
{
  "ok": true,
  "database": "mysql"
}
```

ถ้าเชื่อมต่อฐานข้อมูลไม่ได้ จะตอบสถานะ `503` พร้อม `ok: false`

## Customer API

### แสดงลูกค้าทั้งหมด / ค้นหาชื่อ

```http
GET /api/customer
GET /api/customer?name=สมชาย
```

ไม่ส่ง `name` จะคืนลูกค้าทั้งหมด ส่วน `name` ใช้ค้นจาก `first_name` หรือ `last_name`

### เพิ่มลูกค้า

```http
POST /api/customer
```

Request body:

```json
{
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "phone": "0812345678",
  "address": "หอพัก A มมส.",
  "latitude": 16.2435,
  "longitude": 103.2542
}
```

Response `201 Created`:

```json
{
  "last_id": 1
}
```

### ดึงข้อมูลลูกค้าตาม ID

```http
GET /api/customer/:id
```

ตัวอย่าง:

```http
GET /api/customer/1
```

ถ้าไม่พบข้อมูล จะตอบ `404 Customer not found`

### ค้นหาลูกค้าที่อยู่ใกล้ตำแหน่งที่กำหนด

```http
GET /api/customer/nearby?latitude=16.2435&longitude=103.2542
```

ระบบจะแสดงลูกค้าที่อยู่ภายในระยะ 1 กิโลเมตร พร้อมฟิลด์ `distance_km`

### แก้ไขลูกค้า

```http
PUT /api/customer/:id
```

ตัวอย่าง: `PUT /api/customer/1`

```json
{
  "first_name": "สมชาย",
  "last_name": "ใจดีมาก",
  "phone": "0812345678",
  "address": "หอพัก B มมส.",
  "latitude": 16.244,
  "longitude": 103.255
}
```

Response:

```json
{
  "affected_rows": 1
}
```

### ลบลูกค้า

```http
DELETE /api/customer/:id
```

ตัวอย่าง Response:

```json
{
  "affected_rows": 1
}
```

## Order API

### แสดงออเดอร์ทั้งหมด

```http
GET /api/order
```

ข้อมูลจะรวมข้อมูลลูกค้าที่เกี่ยวข้องด้วย

### เพิ่มออเดอร์

```http
POST /api/order
```

Request body:

```json
{
  "customer_id": 1,
  "box_count": 2
}
```

`box_count` ต้องมีค่าตั้งแต่ 1 ถึง 3 กล่อง และระบบจะตั้งสถานะเริ่มต้นเป็น `ready`

Response `201 Created`:

```json
{
  "last_id": 1
}
```

ค่า `status` เริ่มต้นของออเดอร์ใหม่คือ `ready`

### ค้นหาออเดอร์ที่อยู่ใกล้ตำแหน่งที่กำหนด

```http
GET /api/order/nearby?latitude=16.2435&longitude=103.2542
```

ระบบจะแสดงออเดอร์ภายในระยะ 2 กิโลเมตร พร้อมข้อมูลลูกค้าและ `distance_km`

ต้องส่ง query ทั้ง `latitude` และ `longitude` เป็นตัวเลข

### แก้ไขออเดอร์

```http
PUT /api/order/:id
```

ส่งเฉพาะฟิลด์ที่ต้องการแก้ไขได้ เช่น:

```json
{
  "status": "assigned",
  "box_count": 2
}
```

สถานะที่ใช้ได้: `pending`, `ready`, `assigned`, `delivered`, `cancelled`

### ลบออเดอร์

```http
DELETE /api/order/:id
```

Response:

```json
{
  "affected_rows": 1
}
```

## Rider API

### แสดงไรเดอร์ทั้งหมด

```http
GET /api/rider
```

Response จะเป็น array ของข้อมูลจากตาราง `RIDERS`

## Routing API

### ดูแผนเส้นทางล่าสุด

```http
GET /api/routing/latest
```

ถ้ายังไม่มีแผน Response จะเป็น:

```json
{
  "active_plan": null
}
```

ถ้ามีแผน ระบบจะคืนข้อมูลแผนล่าสุดไว้ในฟิลด์ `active_plan`

## รูปแบบ Error

```json
{
  "error": "Database error"
}
```

รหัสสถานะที่ใช้บ่อย:

| Status | ความหมาย |
|---|---|
| 200 | สำเร็จ |
| 201 | เพิ่มข้อมูลสำเร็จ |
| 400 | ข้อมูลที่ส่งไม่ถูกต้อง |
| 404 | ไม่พบข้อมูล |
| 500 | เกิดข้อผิดพลาดภายในระบบ |

## สมาชิกกลุ่ม

- เศรณี ภูนาโพธิ์  67011212143
- พงศกร ถุนพุฒดม  67011212094
- เอกอนุชา ไชยเสนา  67011212105
- ชินดนัย ภูหัดสวน 67011212026

## ตัวอย่างทดสอบด้วย PowerShell

```powershell
Invoke-RestMethod -Uri "https://finalwebprojectapi.vercel.app/api/customer" -Method GET
Invoke-RestMethod -Uri "https://finalwebprojectapi.vercel.app/api/order" -Method GET
```

ไฟล์นี้อธิบายเฉพาะ API ที่มีอยู่ใน Backend เวอร์ชันปัจจุบัน

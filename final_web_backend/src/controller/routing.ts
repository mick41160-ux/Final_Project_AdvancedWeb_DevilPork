import express from "express";
import { randomBytes, createHash } from "node:crypto";
import { conn } from "../../db";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export const router = express.Router();

const DEPOT = { latitude: 16.2468, longitude: 103.2514 };
const DEFAULT_DEPARTURE = "11:30";
const DEADLINE_MINUTES = 12 * 60 + 30;
const RIDER_FEE = 15;
const COST_PER_KM_PER_BOX = 2;
const REVENUE_PER_BOX = 65;
const FOOD_COST_PER_BOX = 40;
const DEFAULT_SPEED_KMH = 30;
const DEFAULT_STOP_MINUTES = 4;
const MAX_STOPS_PER_RIDER = 3;
// tried in order; the next one is used if the previous fails
const OSRM_URLS = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];

type LatLng = [number, number]; // [lat, lng]

interface ReadyOrder extends RowDataPacket {
  id: number;
  customer_id: number;
  box_count: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface AvailableRider extends RowDataPacket {
  id: number;
  display_name: string;
  phone: string;
}

interface StopPlan {
  order_id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  box_count: number;
  stop_sequence: number;
  estimated_arrival_at: string;
  distance_from_previous_km: number;
}

interface RoutePlan {
  rider_id: number;
  rider_name: string;
  phone: string;
  distance_km: number;
  box_count: number;
  delivery_cost: number;
  estimated_minutes: number;
  estimated_arrival_at: string;
  distance_source: "road" | "straight";
  geometry: LatLng[]; // road-following polyline (depot -> last stop)
  stops: StopPlan[];
}

interface PlanParams {
  planned_departure?: unknown;
  speed_kmh?: unknown;
  stop_minutes?: unknown;
}

/* ---------- distance helpers ---------- */

function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(haversine));
}

const roadCache = new Map<string, { geometry: LatLng[]; legsKm: number[] }>();

/** Ask OSRM for road geometry + per-leg distance (cached by coordinates). */
async function roadRoute(points: LatLng[]) {
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const cached = roadCache.get(coords);
  if (cached) return cached;

  let lastError: unknown;
  for (const base of OSRM_URLS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(
          `${base}/${coords}?overview=full&geometries=geojson&steps=false`,
          {
            signal: AbortSignal.timeout(12000),
            headers: { "User-Agent": "delivery-planner/1.0" },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: any = await res.json();
        const best = data?.routes?.[0];
        if (data?.code !== "Ok" || !best) throw new Error(`code ${data?.code}`);

        const value = {
          geometry: (best.geometry.coordinates as [number, number][]).map(
            ([lng, lat]): LatLng => [lat, lng],
          ),
          legsKm: (best.legs as { distance: number }[]).map(
            (l) => l.distance / 1000,
          ),
        };
        roadCache.set(coords, value);
        return value;
     } catch (error: any) {
        lastError = error;
        console.warn(
          `OSRM failed (${base}, attempt ${attempt}): ${error?.cause?.code ?? error?.message ?? error}`,
        );
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }
  throw lastError;
}

/* ---------- time helpers ---------- */

function parseDeparture(
  value: unknown,
): { date: string; minutes: number } | null {
  const source = value === undefined ? DEFAULT_DEPARTURE : String(value);
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(source) ??
    (source === DEFAULT_DEPARTURE
      ? ["", new Date().toISOString().slice(0, 10), "11", "30"]
      : null);
  if (!match) return null;
  const [, date, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date ||
    hour > 23 ||
    minute > 59
  )
    return null;
  return { date, minutes: hour * 60 + minute };
}

function formatDateTime(date: string, minutes: number): string {
  const dayOffset = Math.floor(minutes / 1440);
  const timeOfDay = ((minutes % 1440) + 1440) % 1440;
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  return `${day.toISOString().slice(0, 10)} ${String(Math.floor(timeOfDay / 60)).padStart(2, "0")}:${String(timeOfDay % 60).padStart(2, "0")}:00`;
}

/* ---------- planning ---------- */

/** Step 1: decide who delivers what, and in which order (nearest-neighbour). */
function assignOrders(orders: ReadyOrder[], riders: AvailableRider[]) {
  const unassigned = [...orders];
  const assignments: { rider: AvailableRider; orders: ReadyOrder[] }[] = [];

  for (const rider of riders) {
    if (unassigned.length === 0) break;
    const picked: ReadyOrder[] = [];
    let current: { latitude: number; longitude: number } = DEPOT;

    while (picked.length < MAX_STOPS_PER_RIDER && unassigned.length > 0) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < unassigned.length; i++) {
        const d = distanceKm(current, unassigned[i]);
        if (
          d < bestDistance ||
          (d === bestDistance && unassigned[i].id < unassigned[bestIndex]?.id)
        ) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      const [order] = unassigned.splice(bestIndex, 1);
      picked.push(order);
      current = order;
    }
    if (picked.length) assignments.push({ rider, orders: picked });
  }
  return assignments;
}

/** Step 2: real road distance (fallback: straight line), arrival times, cost. */
async function buildRoute(
  rider: AvailableRider,
  orders: ReadyOrder[],
  departure: { date: string; minutes: number },
  speedKmh: number,
  stopMinutes: number,
): Promise<RoutePlan> {
  const points: LatLng[] = [
    [DEPOT.latitude, DEPOT.longitude],
    ...orders.map((o): LatLng => [Number(o.latitude), Number(o.longitude)]),
  ];

  let geometry: LatLng[] = points;
  let legsKm: number[];
  let source: "road" | "straight" = "straight";
  try {
    const road = await roadRoute(points);
    geometry = road.geometry;
    legsKm = road.legsKm;
    source = "road";
  } catch (error) {
    console.warn(
      `Road routing failed for rider ${rider.id}, using straight lines`,
      error,
    );
    legsKm = points.slice(1).map((p, i) =>
      distanceKm(
        { latitude: points[i][0], longitude: points[i][1] },
        { latitude: p[0], longitude: p[1] },
      ),
    );
  }

  let elapsed = 0;
  let boxes = 0;
  const stops: StopPlan[] = orders.map((order, i) => {
    const km = legsKm[i] ?? 0;
    elapsed += (km / speedKmh) * 60 + stopMinutes;
    boxes += Number(order.box_count);
    return {
      order_id: Number(order.id),
      customer_id: Number(order.customer_id),
      first_name: order.first_name,
      last_name: order.last_name,
      phone: order.phone,
      address: order.address,
      latitude: Number(order.latitude),
      longitude: Number(order.longitude),
      box_count: Number(order.box_count),
      stop_sequence: i + 1,
      estimated_arrival_at: formatDateTime(
        departure.date,
        departure.minutes + Math.round(elapsed),
      ),
      distance_from_previous_km: Number(km.toFixed(3)),
    };
  });

  const totalKm = legsKm.reduce((a, b) => a + b, 0);
  return {
    rider_id: Number(rider.id),
    rider_name: rider.display_name,
    phone: rider.phone,
    distance_km: Number(totalKm.toFixed(3)),
    box_count: boxes,
    delivery_cost: Number(
      (RIDER_FEE + totalKm * boxes * COST_PER_KM_PER_BOX).toFixed(2),
    ),
    estimated_minutes: Math.ceil(elapsed),
    estimated_arrival_at: stops[stops.length - 1].estimated_arrival_at,
    distance_source: source,
    geometry,
    stops,
  };
}

async function calculatePlan(params: PlanParams = {}) {
  const departure = parseDeparture(params.planned_departure);
  if (!departure)
    return {
      error: "planned_departure must use HH:mm or YYYY-MM-DD HH:mm format",
    } as const;

  const speedKmh =
    params.speed_kmh === undefined
      ? DEFAULT_SPEED_KMH
      : Number(params.speed_kmh);
  const stopMinutes =
    params.stop_minutes === undefined
      ? DEFAULT_STOP_MINUTES
      : Number(params.stop_minutes);
  if (!(speedKmh > 0))
    return { error: "speed_kmh must be greater than 0" } as const;
  if (!(stopMinutes >= 0))
    return { error: "stop_minutes must be 0 or greater" } as const;

  const [orderRows] = await conn.query<ReadyOrder[]>(
    `SELECT o.id, o.customer_id, o.box_count, c.first_name, c.last_name, c.phone,
      c.address, c.latitude, c.longitude
     FROM ORDERS o JOIN CUSTOMERS c ON c.id = o.customer_id
     WHERE o.status IN ('pending', 'ready')
     ORDER BY o.id`,
  );
  const [riderRows] = await conn.query<AvailableRider[]>(
    "SELECT id, display_name, phone FROM RIDERS WHERE is_available = TRUE ORDER BY id",
  );

  const assignments = assignOrders(orderRows, riderRows);
  const routes: RoutePlan[] = [];
  for (const a of assignments) {
    const route = await buildRoute(a.rider, a.orders, departure, speedKmh, stopMinutes);
    routes.push(route);
    // เพิ่มการหน่วงเวลา 500 มิลลิวินาที เพื่อไม่ให้เซิร์ฟเวอร์ OSRM สาธารณะแบนการเชื่อมต่อ
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const assignedOrderIds = new Set(
    routes.flatMap((route) => route.stops.map((stop) => stop.order_id)),
  );
  const totalDistance = routes.reduce((sum, r) => sum + r.distance_km, 0);
  const totalBoxes = routes.reduce((sum, r) => sum + r.box_count, 0);
  const totalRevenue = totalBoxes * REVENUE_PER_BOX;
  const foodCost = totalBoxes * FOOD_COST_PER_BOX;
  const deliveryCost = Number(
    routes.reduce((sum, r) => sum + r.delivery_cost, 0).toFixed(2),
  );
  const finishDeadline = formatDateTime(departure.date, DEADLINE_MINUTES);
  const latestArrival = routes.reduce(
    (latest, r) =>
      r.estimated_arrival_at > latest ? r.estimated_arrival_at : latest,
    formatDateTime(departure.date, departure.minutes),
  );
  const fallbackCount = routes.filter(
    (r) => r.distance_source === "straight",
  ).length;

  return {
    active_plan: {
      id: null as number | null,
      status: "draft",
      planned_departure: formatDateTime(departure.date, departure.minutes),
      finish_deadline: finishDeadline,
      assumptions: {
        distance_model: fallbackCount
          ? "osrm_road_with_haversine_fallback"
          : "osrm_road",
        speed_kmh: speedKmh,
        stop_minutes: stopMinutes,
        max_stops_per_rider: MAX_STOPS_PER_RIDER,
        rider_fee: RIDER_FEE,
        cost_per_km_per_box: COST_PER_KM_PER_BOX,
      },
      summary: {
        order_count: assignedOrderIds.size,
        total_order_count: orderRows.length,
        unassigned_order_ids: orderRows
          .filter((order) => !assignedOrderIds.has(Number(order.id)))
          .map((order) => Number(order.id)),
        rider_count: routes.length,
        total_distance_km: Number(totalDistance.toFixed(3)),
        estimated_finish_at: latestArrival,
        meets_deadline: latestArrival <= finishDeadline,
        fallback_count: fallbackCount,
        revenue: totalRevenue,
        food_cost: foodCost,
        delivery_cost: deliveryCost,
        estimated_profit: Number(
          (totalRevenue - foodCost - deliveryCost).toFixed(2),
        ),
      },
      routes,
    },
  };
}

/* ---------- endpoints ---------- */

router.get("/latest", async (_req, res) => {
  try {
    const [runs] = await conn.query<RowDataPacket[]>(
      "SELECT id, status, planned_departure FROM ROUTING_RUNS WHERE status IN ('committed', 'draft') ORDER BY (status = 'committed') DESC, id DESC LIMIT 1",
    );
    if (!runs.length) return res.json({ active_plan: null });
    const run = runs[0];
    const [routes] = await conn.query<RowDataPacket[]>(
      `SELECT r.id, r.rider_id, r.distance_km, rd.display_name AS rider_name, rd.phone
       FROM ROUTES r LEFT JOIN RIDERS rd ON rd.id = r.rider_id
       WHERE r.routing_run_id = ? ORDER BY r.id`,
      [run.id],
    );
    const routeIds = routes.map((route) => Number(route.id));
    let stops: RowDataPacket[] = [];
    if (routeIds.length) {
      const placeholders = routeIds.map(() => "?").join(",");
      const [stopRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.route_id, s.order_id, s.stop_sequence, s.estimated_arrival_at,
          o.customer_id, o.box_count, o.status AS order_status,
          c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude
         FROM ROUTE_STOPS s JOIN ORDERS o ON o.id = s.order_id
         JOIN CUSTOMERS c ON c.id = o.customer_id
         WHERE s.route_id IN (${placeholders}) ORDER BY s.route_id, s.stop_sequence`,
        routeIds,
      );
      stops = stopRows;
    }
    const fullRoutes = routes.map((route) => ({
      ...route,
      stops: stops.filter((stop) => Number(stop.route_id) === Number(route.id)),
    }));
    res.json({ active_plan: { ...run, routes: fullRoutes } });
  } catch (error: any) {
    console.error("Latest routing query failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/calculate", async (req, res) => {
  try {
    const result = await calculatePlan(req.body ?? {});
    if ("error" in result) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error: any) {
    console.error("Route calculation failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/commit", async (req, res) => {
  let connection: PoolConnection | undefined;
  try {
    const result = await calculatePlan(req.body ?? {});
    if ("error" in result) return res.status(400).json({ error: result.error });
    const plan = result.active_plan;
    if (plan.summary.total_order_count === 0) {
      return res.status(409).json({
        error: "There are no pending or ready orders to assign",
        plan,
      });
    }
    if (plan.summary.unassigned_order_ids.length) {
      return res.status(409).json({
        error:
          "Not all ready orders can be assigned; add available riders or review the 3-stop rider limit",
        plan,
      });
    }
    if (!plan.summary.meets_deadline) {
      return res
        .status(409)
        .json({ error: "The estimated plan misses the 12:30 deadline", plan });
    }

    connection = await conn.getConnection();
    await connection.beginTransaction();
    await connection.query(
      "UPDATE ROUTING_RUNS SET status = 'superseded' WHERE status = 'committed'",
    );
    const [runInsert] = await connection.query(
      "INSERT INTO ROUTING_RUNS(status, planned_departure) VALUES ('committed', ?)",
      [plan.planned_departure],
    );
    const routingRunId = Number((runInsert as any).insertId);

    for (const route of plan.routes) {
      const jobCode = randomBytes(9).toString("hex").toUpperCase();
      const jobCodeHash = createHash("sha256").update(jobCode).digest("hex");
      const [routeInsert] = await connection.query(
        "INSERT INTO ROUTES(routing_run_id, rider_id, distance_km, job_code_hash) VALUES (?, ?, ?, ?)",
        [routingRunId, route.rider_id, route.distance_km, jobCodeHash],
      );
      const routeId = Number((routeInsert as any).insertId);
      for (const stop of route.stops) {
        await connection.query(
          "INSERT INTO ROUTE_STOPS(route_id, order_id, stop_sequence, estimated_arrival_at) VALUES (?, ?, ?, ?)",
          [
            routeId,
            stop.order_id,
            stop.stop_sequence,
            stop.estimated_arrival_at,
          ],
        );
        await connection.query(
          "UPDATE ORDERS SET status = 'assigned' WHERE id = ? AND status IN ('pending', 'ready')",
          [stop.order_id],
        );
      }
      (route as RoutePlan & { job_code?: string }).job_code = jobCode;
    }

    await connection.commit();
    plan.id = routingRunId;
    plan.status = "committed";
    res.status(201).json({
      active_plan: plan,
      rider_job_codes: plan.routes.map((route) => ({
        rider_id: route.rider_id,
        job_code: (route as RoutePlan & { job_code?: string }).job_code,
      })),
    });
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error("Routing commit failed:", error);
    res.status(500).json({ error: "Could not commit routing plan" });
  } finally {
    connection?.release();
  }
});

router.get("/job/:code", async (req, res) => {
  if (!/^[a-f0-9]{18}$/i.test(req.params.code))
    return res.status(400).json({ error: "Invalid job code" });
  try {
    const hash = createHash("sha256")
      .update(req.params.code.toUpperCase())
      .digest("hex");
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT rr.id AS routing_run_id, rr.planned_departure, r.id AS route_id,
        r.distance_km, rd.display_name AS rider_name
       FROM ROUTES r JOIN ROUTING_RUNS rr ON rr.id = r.routing_run_id
       LEFT JOIN RIDERS rd ON rd.id = r.rider_id
       WHERE r.job_code_hash = ? AND rr.status = 'committed' LIMIT 1`,
      [hash],
    );
    if (!rows.length)
      return res.status(404).json({ error: "Delivery job not found" });
    const route = rows[0];
    const [stops] = await conn.query<RowDataPacket[]>(
      `SELECT s.stop_sequence, s.estimated_arrival_at, o.id AS order_id,
        o.box_count, c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude
       FROM ROUTE_STOPS s JOIN ORDERS o ON o.id = s.order_id
       JOIN CUSTOMERS c ON c.id = o.customer_id
       WHERE s.route_id = ? ORDER BY s.stop_sequence`,
      [route.route_id],
    );
    res.json({
      ...route,
      total_boxes: stops.reduce((sum, stop) => sum + Number(stop.box_count), 0),
      stops,
    });
  } catch (error: any) {
    console.error("Delivery job lookup failed:", error);
    res.status(500).json({ error: "Database error" });
  }
});
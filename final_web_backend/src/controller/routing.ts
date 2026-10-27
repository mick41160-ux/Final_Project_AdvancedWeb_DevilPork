import express from "express";
import { randomBytes, createHash } from "node:crypto";
import { conn } from "../../db";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export const router = express.Router();

const DEPOT = { latitude: 16.2468, longitude: 103.2514 };
const SERVICE_RADIUS_KM = 3;
const DEFAULT_DEPARTURE = "11:30";
const RIDER_FEE = 15;
const COST_PER_KM_PER_BOX = 2;
const SPEED_KMH = 30;
const STOP_MINUTES = 4;

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
  stops: StopPlan[];
}

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

function planOrders(
  orders: ReadyOrder[],
  riders: AvailableRider[],
  departure: { date: string; minutes: number },
): RoutePlan[] {
  const unassigned = [...orders];
  const routes: RoutePlan[] = [];

  for (const rider of riders) {
    if (unassigned.length === 0) break;
    const stops: StopPlan[] = [];
    let current = DEPOT;
    let boxes = 0;
    let elapsed = 0;
    let totalDistance = 0;

    while (stops.length < 3 && unassigned.length > 0) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < unassigned.length; index++) {
        const distance = distanceKm(current, unassigned[index]);
        if (
          distance < bestDistance ||
          (distance === bestDistance &&
            unassigned[index].id < unassigned[bestIndex]?.id)
        ) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      const order = unassigned[bestIndex];
      unassigned.splice(bestIndex, 1);
      totalDistance += bestDistance;
      elapsed += (bestDistance / SPEED_KMH) * 60 + STOP_MINUTES;
      boxes += Number(order.box_count);
      stops.push({
        order_id: Number(order.id),
        customer_id: Number(order.customer_id),
        first_name: order.first_name,
        last_name: order.last_name,
        phone: order.phone,
        address: order.address,
        latitude: Number(order.latitude),
        longitude: Number(order.longitude),
        box_count: Number(order.box_count),
        stop_sequence: stops.length + 1,
        estimated_arrival_at: formatDateTime(
          departure.date,
          departure.minutes + Math.round(elapsed),
        ),
        distance_from_previous_km: Number(bestDistance.toFixed(3)),
      });
      current = order;
    }

    if (stops.length > 0) {
      routes.push({
        rider_id: Number(rider.id),
        rider_name: rider.display_name,
        phone: rider.phone,
        distance_km: Number(totalDistance.toFixed(3)),
        box_count: boxes,
        delivery_cost: Number(
          (RIDER_FEE + totalDistance * boxes * COST_PER_KM_PER_BOX).toFixed(2),
        ),
        estimated_minutes: Math.ceil(elapsed),
        estimated_arrival_at: stops[stops.length - 1].estimated_arrival_at,
        stops,
      });
    }
  }

  return routes;
}

async function calculatePlan(plannedDeparture: unknown) {
  const departure = parseDeparture(plannedDeparture);
  if (!departure)
    return {
      error: "planned_departure must use HH:mm or YYYY-MM-DD HH:mm format",
    } as const;

  const [allReadyOrders] = await conn.query<ReadyOrder[]>(
    `SELECT o.id, o.customer_id, o.box_count, c.first_name, c.last_name, c.phone,
      c.address, c.latitude, c.longitude
     FROM ORDERS o JOIN CUSTOMERS c ON c.id = o.customer_id
     WHERE o.status IN ('pending', 'ready')
     ORDER BY o.id`,
  );
  // Only plan deliveries in the restaurant's Maha Sarakham service area.
  // Nearby customers from other provinces must not be mixed into this run.
  const orderRows = allReadyOrders.filter(
    (order) => distanceKm(DEPOT, order) <= SERVICE_RADIUS_KM,
  );
  const outsideServiceAreaOrderCount = allReadyOrders.length - orderRows.length;
  const [riderRows] = await conn.query<AvailableRider[]>(
    "SELECT id, display_name, phone FROM RIDERS WHERE is_available = TRUE ORDER BY id",
  );

  const routes = planOrders(orderRows, riderRows, departure);
  const assignedOrderIds = new Set(
    routes.flatMap((route) => route.stops.map((stop) => stop.order_id)),
  );
  const totalDistance = routes.reduce(
    (sum, route) => sum + route.distance_km,
    0,
  );
  const totalBoxes = routes.reduce((sum, route) => sum + route.box_count, 0);
  const totalRevenue = totalBoxes * 65;
  const foodCost = totalBoxes * 40;
  const deliveryCost = Number(
    routes.reduce((sum, route) => sum + route.delivery_cost, 0).toFixed(2),
  );
  const finishDeadline = formatDateTime(departure.date, 12 * 60 + 30);
  const latestArrival = routes.reduce(
    (latest, route) =>
      route.estimated_arrival_at > latest ? route.estimated_arrival_at : latest,
    formatDateTime(departure.date, departure.minutes),
  );

  return {
    active_plan: {
      id: null,
      status: "draft",
      planned_departure: formatDateTime(departure.date, departure.minutes),
      finish_deadline: finishDeadline,
      assumptions: {
        distance_model: "haversine_straight_line",
        speed_kmh: SPEED_KMH,
        stop_minutes: STOP_MINUTES,
        max_stops_per_rider: 3,
        service_radius_km: SERVICE_RADIUS_KM,
        rider_fee: RIDER_FEE,
        cost_per_km_per_box: COST_PER_KM_PER_BOX,
      },
      summary: {
        order_count: assignedOrderIds.size,
        total_order_count: orderRows.length,
        outside_service_area_order_count: outsideServiceAreaOrderCount,
        unassigned_order_ids: orderRows
          .filter((order) => !assignedOrderIds.has(Number(order.id)))
          .map((order) => Number(order.id)),
        rider_count: routes.length,
        total_distance_km: Number(totalDistance.toFixed(3)),
        estimated_finish_at: latestArrival,
        meets_deadline: latestArrival <= finishDeadline,
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
    const result = await calculatePlan(req.body?.planned_departure);
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
    const result = await calculatePlan(req.body?.planned_departure);
    if ("error" in result) return res.status(400).json({ error: result.error });
    const plan = result.active_plan;
    if (plan.summary.total_order_count === 0) {
      return res
        .status(409)
        .json({
          error: "There are no pending or ready orders to assign",
          plan,
        });
    }
    if (plan.summary.unassigned_order_ids.length) {
      return res
        .status(409)
        .json({
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
    (plan as { id: number | null; status: string }).id = routingRunId;
    (plan as { id: number | null; status: string }).status = "committed";
    res
      .status(201)
      .json({
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

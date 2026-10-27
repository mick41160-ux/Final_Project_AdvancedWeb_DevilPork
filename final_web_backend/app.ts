import express from "express";
import cors from "cors";
import { router as index } from "./src/controller/index";
import { router as customer } from "./src/controller/customer";
import { router as order } from "./src/controller/order";
import { router as rider } from "./src/controller/rider";
import { router as routing } from "./src/controller/routing";

export const app = express();
app.use(cors());
app.use(express.json());
app.use("/", index);
app.use("/api/customer", customer);
app.use("/api/order", order);
app.use("/api/rider", rider);
app.use("/api/routing", routing);

export default app;

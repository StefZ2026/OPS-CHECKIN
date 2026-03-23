import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", router);

export default app;

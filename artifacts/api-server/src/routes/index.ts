import { Router, type IRouter } from "express";
import healthRouter from "./health";
import attendeesRouter from "./attendees";
import adminRouter, { requireAdminAuth } from "./admin";
import uploadRouter from "./upload";
import eventsRouter from "./events";
import authRouter from "./auth";
import orgsRouter from "./orgs";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/orgs", orgsRouter);
router.use(adminRouter);
router.use(uploadRouter);
// Event-scoped routes: /api/events/:eventSlug/...
// Must be before the catch-all requireAdminAuth middleware below.
router.use("/events/:eventSlug", eventsRouter);
router.use(requireAdminAuth, attendeesRouter);

export default router;

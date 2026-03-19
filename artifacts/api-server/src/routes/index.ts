import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkinRouter from "./checkin";
import attendeesRouter from "./attendees";
import adminRouter, { requireAdminAuth } from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkinRouter);
router.use(requireAdminAuth, attendeesRouter);
router.use(adminRouter);

export default router;

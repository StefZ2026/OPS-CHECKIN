import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkinRouter from "./checkin";
import attendeesRouter from "./attendees";
import adminRouter, { requireAdminAuth } from "./admin";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkinRouter);
router.use(adminRouter);
router.use(uploadRouter);
router.use(requireAdminAuth, attendeesRouter);

export default router;

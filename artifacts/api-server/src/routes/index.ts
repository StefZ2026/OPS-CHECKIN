import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkinRouter from "./checkin";
import attendeesRouter from "./attendees";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkinRouter);
router.use(attendeesRouter);

export default router;

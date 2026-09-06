import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import customersRouter from "./customers";
import partnerAgreementsRouter from "./partner-agreements";
import storageRouter from "./storage";
import smtpSettingsRouter from "./smtp-settings";
import inquiriesRouter from "./inquiries";
import publicTeamRouter from "./public-team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inquiriesRouter);
router.use(publicTeamRouter);
router.use(adminRouter);
router.use(customersRouter);
router.use(partnerAgreementsRouter);
router.use(storageRouter);
router.use(smtpSettingsRouter);

export default router;

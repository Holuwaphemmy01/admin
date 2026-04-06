import { Router } from "express";

import adminAuthRouter from "../admin-auth/routes";

const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);

export default adminRouter;

import { Router } from "express";

import adminAccountsRouter from "../admin-accounts/routes";
import adminAuthRouter from "../admin-auth/routes";

const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/auth", adminAccountsRouter);

export default adminRouter;

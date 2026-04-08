import { Router } from "express";

import adminAccountsRouter from "../admin-accounts/routes";
import adminAuthRouter from "../admin-auth/routes";
import adminKycRouter from "../admin-kyc/routes";
import adminUsersRouter from "../admin-users/routes";

const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/auth", adminAccountsRouter);
adminRouter.use("/kyc", adminKycRouter);
adminRouter.use("/users", adminUsersRouter);

export default adminRouter;

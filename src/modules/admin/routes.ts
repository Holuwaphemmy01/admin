import { Router } from "express";

import adminAccountsRouter from "../admin-accounts/routes";
import adminAuthRouter from "../admin-auth/routes";
import adminKycRouter from "../admin-kyc/routes";
import adminProductsRouter, { adminProductsCollectionRouter } from "../admin-products/routes";
import adminUsersRouter from "../admin-users/routes";

const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/auth", adminAccountsRouter);
adminRouter.use("/kyc", adminKycRouter);
adminRouter.use("/product", adminProductsRouter);
adminRouter.use("/products", adminProductsCollectionRouter);
adminRouter.use("/users", adminUsersRouter);

export default adminRouter;

import { Router } from "express";

import adminAccountsRouter from "../admin-accounts/routes";
import adminAuthRouter from "../admin-auth/routes";
import adminCampaignsRouter from "../admin-campaigns/routes";
import adminDeliveryRouter from "../admin-delivery/routes";
import adminKycRouter from "../admin-kyc/routes";
import adminOrdersRouter from "../admin-orders/routes";
import adminProductsRouter, { adminProductsCollectionRouter } from "../admin-products/routes";
import adminSettlementsRouter from "../admin-settlements/routes";
import adminSubscriptionsRouter from "../admin-subscriptions/routes";
import adminTransactionsRouter from "../admin-transactions/routes";
import adminUsersRouter from "../admin-users/routes";
import adminWalletRouter from "../admin-wallet/routes";

const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/auth", adminAccountsRouter);
adminRouter.use("/campaigns", adminCampaignsRouter);
adminRouter.use("/delivery", adminDeliveryRouter);
adminRouter.use("/subscriptions", adminSubscriptionsRouter);
adminRouter.use("/transactions", adminTransactionsRouter);
adminRouter.use("/wallet", adminWalletRouter);
adminRouter.use("/settlements", adminSettlementsRouter);
adminRouter.use("/kyc", adminKycRouter);
adminRouter.use("/orders", adminOrdersRouter);
adminRouter.use("/product", adminProductsRouter);
adminRouter.use("/products", adminProductsCollectionRouter);
adminRouter.use("/users", adminUsersRouter);

export default adminRouter;

import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";

import { checkDatabaseConnection } from "./config/db";
import { swaggerSpec, swaggerUiOptions } from "./config/swagger";
import adminRouter from "./modules/admin/routes";

const app = express();

app.use(express.json());
app.get("/docs.json", (_req: Request, res: Response) => {
  res.json(swaggerSpec);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use("/admin", adminRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "Express API is running"
  });
});

app.get("/api/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const database = await checkDatabaseConnection();

    res.json({
      status: "ok",
      database
    });
  } catch (error) {
    next(error);
  }
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    message: "Route not found"
  });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    res.status(400).json({
      message: "Invalid JSON body"
    });

    return;
  }

  console.error(error);

  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined
  });
});

export default app;

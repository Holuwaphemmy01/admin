import express, { NextFunction, Request, Response } from "express";

import { checkDatabaseConnection } from "./config/db";

const app = express();

app.use(express.json());

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
  console.error(error);

  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined
  });
});

export default app;

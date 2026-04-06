import dotenv from "dotenv";

import app from "./app";
import { checkDatabaseConnection } from "./config/db";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
  const database = await checkDatabaseConnection();

  if (database.configured && database.connected) {
    console.log(`PostgreSQL connected successfully at ${database.serverTime.toISOString()}`);
  } else if (database.configured) {
    console.error(`PostgreSQL connection failed: ${database.message}`);
  } else {
    console.warn(`PostgreSQL not configured: ${database.message}`);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((error: Error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});

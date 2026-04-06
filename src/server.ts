import dotenv from "dotenv";

import app from "./app";
import { checkDatabaseConnection } from "./config/db";
import { getAdminAuthConfig } from "./modules/admin-auth/config";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
  const adminConfig = getAdminAuthConfig();

  console.log(`Admin auth configured for super admin "${adminConfig.superAdmin.username}"`);

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

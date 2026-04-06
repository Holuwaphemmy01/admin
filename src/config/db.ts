import { Pool, QueryResult, QueryResultRow } from "pg";

type DatabaseStatus =
  | {
      configured: false;
      connected: false;
      message: string;
    }
  | {
      configured: true;
      connected: true;
      serverTime: Date;
    }
  | {
      configured: true;
      connected: false;
      message: string;
    };

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  const currentPool = getPool();

  if (!currentPool) {
    return {
      configured: false,
      connected: false,
      message: "Set DATABASE_URL in the .env file to enable PostgreSQL."
    };
  }

  let client;

  try {
    client = await currentPool.connect();
    const result: QueryResult<{ now: Date }> = await client.query("SELECT NOW() AS now");

    return {
      configured: true,
      connected: true,
      serverTime: result.rows[0].now
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    return {
      configured: true,
      connected: false,
      message
    };
  } finally {
    client?.release();
  }
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const currentPool = getPool();

  if (!currentPool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return currentPool.query<T>(text, params);
}

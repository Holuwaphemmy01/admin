# Node Express PostgreSQL TypeScript Starter

This is a simple Node.js, Express, and PostgreSQL starter project written in TypeScript.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Update the `.env` file and add your PostgreSQL connection string to `DATABASE_URL`.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Build the project for production:

   ```bash
   npm run build
   ```

5. Start the compiled server:

   ```bash
   npm start
   ```

## Environment variables

- `PORT`: The port the API runs on.
- `DATABASE_URL`: PostgreSQL connection string.
- `DATABASE_SSL`: Set to `true` if your database provider requires SSL.

## Routes

- `GET /`: Basic welcome route.
- `GET /api/health`: Shows API health and tries to connect to PostgreSQL when `DATABASE_URL` is set.

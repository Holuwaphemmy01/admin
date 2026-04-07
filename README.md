# BrickPine Admin API Starter

This is a TypeScript Node.js and Express starter for the BrickPine admin API with PostgreSQL connectivity, DB-backed admin authentication, and a Jest-based test setup.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Update the `.env` file with your PostgreSQL connection string and admin auth credentials.

3. Start the development server:

   ```bash
   npm run dev
   ```

   This uses `nodemon` to restart the app when `src/` files or `.env` change.

4. Build the project for production:

   ```bash
   npm run build
   ```

5. Start the compiled server:

   ```bash
   npm start
   ```

6. Run the test suite:

   ```bash
   npm test
   ```

## Environment variables

- `PORT`: The port the API runs on.
- `DATABASE_URL`: PostgreSQL connection string.
- `DATABASE_SSL`: Set to `true` if your database provider requires SSL.
- `ADMIN_SUPER_USERNAME`: Login username for the embedded super admin.
- `ADMIN_SUPER_EMAIL`: Email identifier for the embedded super admin.
- `ADMIN_SUPER_PHONE`: Phone identifier for the embedded super admin.
- `ADMIN_SUPER_PASSWORD`: Bootstrap password used only to seed the initial super admin credential.
- `ADMIN_SUPER_FIRST_NAME`: First name returned in the admin login response.
- `ADMIN_SUPER_LAST_NAME`: Last name returned in the admin login response.
- `ADMIN_SUPER_USER_TYPE_ID`: Integer role type ID returned in the admin login response.
- `ADMIN_SUPER_CREATED_AT`: Optional ISO timestamp returned in the admin login response.
- `ADMIN_JWT_SECRET`: Secret used only for admin JWT signing and verification.
- `ADMIN_JWT_EXPIRES_IN`: Admin JWT lifetime, for example `1h` or `1d`.
- `ADMIN_INVITE_FRONTEND_URL`: Absolute frontend URL used to build admin invite links.

## Routes

- `GET /`: Basic welcome route.
- `GET /api/health`: Shows API health and tries to connect to PostgreSQL when `DATABASE_URL` is set.
- `POST /admin/auth/login`: Logs in an active admin account with a separate admin JWT.
- `POST /admin/auth/invite`: Creates a pending admin invite and queues an invite email for a super admin.
- `PUT /admin/auth/change_password`: Lets an authenticated admin change their own password.
- `GET /admin/users`: Lists customer users with admin filters and pagination for a super admin.
- `GET /docs`: Swagger UI for the API documentation.
- `GET /docs.json`: Raw OpenAPI JSON specification.

## Database migration

Run the SQL migrations in `migrations/001_create_admin_invites.sql` and `migrations/002_create_admin_auth_tables.sql` against your PostgreSQL database before using the admin auth endpoints.

## Testing

- `npm test`: Runs the Jest test suite.
- `npm run test:watch`: Runs Jest in watch mode.
- `npm run test:typecheck`: Type-checks source and test files with the Jest test typings.

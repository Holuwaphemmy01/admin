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
- `GET /admin/delivery/pricing`: Lists delivery pricing records with optional state and vehicle type filters for a super admin.
- `GET /admin/delivery/surge`: Returns the current delivery surge overview for a super admin.
- `PUT /admin/delivery/surge`: Updates the current delivery surge settings for a super admin.
- `GET /admin/subscriptions`: Lists seller and logistics subscription plans for a super admin.
- `GET /admin/campaigns`: Lists promoted post campaigns with optional status, username, and pagination filters for a super admin.
- `GET /admin/campaigns/analytics`: Returns aggregate promoted-post performance metrics with optional date filters for a super admin.
- `GET /admin/analytics/overview`: Returns top-level platform dashboard metrics with an optional relative period filter for a super admin.
- `GET /admin/analytics/revenue`: Returns platform revenue totals with optional date filters and a grouped breakdown by revenue category, subscription tier, or calendar month for a super admin.
- `GET /admin/analytics/top_sellers`: Returns the best-performing sellers with optional limit and daily, weekly, or monthly ranking windows for a super admin.
- `GET /admin/support/tickets`: Lists support tickets across platform users with optional status, username, category, and pagination filters for a super admin.
- `POST /admin/support/categories`: Creates a support category and returns the updated support-category list for a super admin.
- `GET /admin/support/tickets/:ticketId`: Returns one support ticket with its reconstructed conversation thread for a super admin.
- `POST /admin/support/tickets/:ticketId/reply`: Creates an admin reply for a support ticket and can return signed upload params for an attachment for a super admin.
- `PUT /admin/support/tickets/:ticketId/close`: Closes a support ticket thread and can persist an optional resolution note for a super admin.
- `GET /admin/campaigns/:campaignId`: Returns one promoted post campaign with current metrics for a super admin.
- `PUT /admin/campaigns/:campaignId/approve`: Approves and activates a promoted post campaign for a super admin.
- `PUT /admin/campaigns/:campaignId/reject`: Rejects a promoted post campaign with a required reason for a super admin.
- `PUT /admin/campaigns/:campaignId/pause`: Force-pauses an active promoted post campaign for a super admin.
- `POST /admin/subscriptions/plans`: Creates a new active annual seller or logistics subscription plan for a super admin.
- `PUT /admin/subscriptions/plans/:id`: Updates one or more editable fields on an existing subscription plan for a super admin.
- `DELETE /admin/subscriptions/plans/:id`: Removes an existing subscription plan for a super admin.
- `PUT /admin/subscriptions/:username/grant`: Manually grants a subscription plan to a platform user for a super admin.
- `PUT /admin/subscriptions/:username/revoke`: Revokes the active subscription for a platform user for a super admin.
- `POST /admin/delivery/pricing`: Creates a delivery pricing record for a state and vehicle type for a super admin.
- `PUT /admin/delivery/pricing/:id`: Updates one or more fields on an existing delivery pricing record for a super admin.
- `DELETE /admin/delivery/pricing/:id`: Removes an existing delivery pricing record for a super admin.
- `GET /admin/transactions`: Lists platform wallet transactions with optional user, type, date, and pagination filters for a super admin.
- `GET /admin/transactions/:transactionId`: Returns one platform wallet transaction by deterministic reference for a super admin, with a conflict response when the reference is ambiguous.
- `GET /admin/wallet/platform`: Returns the platform wallet owner, wallet balances, commission totals, and recent platform wallet transactions for a super admin.
- `POST /admin/wallet/manual_credit`: Credits a customer user's wallet, records the wallet transaction, and writes an admin wallet audit row for a super admin.
- `POST /admin/wallet/manual_debit`: Debits a customer user's wallet, records the wallet transaction, and writes an admin wallet audit row for a super admin.
- `GET /admin/wallet/:username`: Returns a customer user's wallet balances and currency for a super admin.
- `GET /admin/settlements`: Lists settlement requests with optional status, username, and pagination filters for a super admin.
- `GET /admin/settlements/stats`: Returns settlement counts and pending/approved amount totals for a super admin.
- `PUT /admin/settlements/:id/approve`: Approves a pending settlement payout, debits the beneficiary wallet, creates a settlement-linked wallet transaction, and writes an admin audit row for a super admin.
- `PUT /admin/settlements/:id/reject`: Rejects a pending settlement request with a required reason and writes an admin rejection audit row for a super admin.
- `POST /admin/product/categories`: Creates an active product category with required description and commission VAT tiers for a super admin.
- `PUT /admin/product/categories/:id`: Updates one or more fields on an existing product category for a super admin.
- `DELETE /admin/product/categories/:id`: Deletes a product category for a super admin when no linked products or category commissions still reference it.
- `PUT /admin/product/:productId/flag`: Flags a product or soft-removes it for policy violations for a super admin.
- `GET /admin/products`: Lists products across sellers with optional username, category, and status filters for a super admin.
- `GET /admin/orders`: Lists platform orders with optional status, seller, buyer, and date filters for a super admin.
- `GET /admin/orders/stats`: Returns aggregate order counts, completion rate, and order-volume trend buckets for a super admin.
- `GET /admin/orders/:orderNumber`: Returns the full details for a single platform order, including parties, line items, and total amount for a super admin.
- `PUT /admin/orders/:orderNumber/cancel`: Force-cancels selected order rows for an order number, optionally records a reason, and updates linked delivery state for a super admin.
- `GET /admin/kyc/pending`: Lists the latest real pending KYC submissions for sellers and logistics users for a super admin.
- `GET /admin/kyc/stats`: Returns aggregate pending, approved, rejected, and approval-rate KYC stats for the latest real seller and logistics submissions for a super admin.
- `GET /admin/kyc/:username`: Returns the latest full KYC submission for a seller or logistics user for a super admin.
- `PUT /admin/kyc/:username/approve`: Approves the latest KYC submission for a seller or logistics user for a super admin.
- `PUT /admin/kyc/:username/reject`: Rejects the latest KYC submission for a seller or logistics user, requires a rejection reason, and records it for a super admin.
- `GET /admin/users`: Lists customer users with admin filters and pagination for a super admin.
- `GET /admin/users/stats`: Returns customer-user totals and growth trend stats for a super admin.
- `GET /admin/users/:username`: Returns the full customer user profile, curated bio data, and placeholder social/follow summaries for a super admin.
- `DELETE /admin/users/:username`: Permanently deletes a customer user account and records the required deletion reason for a super admin.
- `PUT /admin/users/:username/suspend`: Suspends a customer user account and records the suspension comment for a super admin.
- `PUT /admin/users/:username/activate`: Reactivates a suspended customer user account and records an optional note for a super admin.
- `GET /docs`: Swagger UI for the API documentation.
- `GET /docs.json`: Raw OpenAPI JSON specification.

## Database migration

Run the SQL migrations in `migrations/001_create_admin_invites.sql`, `migrations/002_create_admin_auth_tables.sql`, `migrations/003_create_admin_access_audit_logs.sql`, `migrations/004_create_user_access_audit_logs.sql`, `migrations/005_update_user_access_audit_logs_for_reactivation.sql`, `migrations/006_create_user_deletion_audit_logs.sql`, `migrations/007_create_kyc_rejection_audit_logs.sql`, `migrations/008_add_product_category_normalized_name_unique_index.sql`, `migrations/009_add_product_policy_moderation_support.sql`, `migrations/010_create_admin_order_action_audit_logs.sql`, `migrations/011_create_admin_wallet_action_audit_logs.sql`, `migrations/012_update_admin_wallet_action_audit_logs_for_manual_debit.sql`, `migrations/013_create_admin_settlement_action_audit_logs.sql`, `migrations/014_create_admin_settlement_rejection_audit_logs.sql`, `migrations/015_create_delivery_current_surge_config.sql`, and `migrations/016_add_subscription_normalized_name_type_duration_unique_index.sql` against your PostgreSQL database before using the admin and user-management endpoints.

## Testing

- `npm test`: Runs the Jest test suite.
- `npm run test:watch`: Runs Jest in watch mode.
- `npm run test:typecheck`: Type-checks source and test files with the Jest test typings.

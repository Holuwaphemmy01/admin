export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "BrickPine Admin API",
    version: "1.0.0",
    description:
      "Swagger documentation for the BrickPine admin monolith, including health endpoints and DB-backed admin authentication."
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server"
    }
  ],
  tags: [
    {
      name: "System",
      description: "General system and health endpoints"
    },
    {
      name: "Admin Auth",
      description: "Admin authentication endpoints separated from customer auth"
    },
    {
      name: "Wallet & Transactions",
      description: "Administrative platform wallet overview and recent transaction endpoints"
    },
    {
      name: "Delivery & Logistics",
      description: "Administrative delivery-pricing management endpoints"
    },
    {
      name: "Settlements",
      description: "Administrative settlement-listing endpoints"
    },
    {
      name: "Product Management",
      description: "Administrative product and product-category management endpoints"
    },
    {
      name: "Order Management",
      description: "Administrative order-management endpoints across the platform"
    },
    {
      name: "User Management",
      description: "Administrative customer-user management endpoints"
    },
    {
      name: "KYC Verification",
      description: "Administrative KYC review and verification endpoints"
    },
    {
      name: "Subscriptions",
      description: "Administrative subscription-plan listing endpoints"
    },
    {
      name: "Ads & Promoted Posts",
      description: "Administrative promoted-post campaign listing endpoints"
    },
    {
      name: "Support & Tickets",
      description: "Administrative support-ticket listing endpoints"
    }
  ],
  components: {
    securitySchemes: {
      AdminBearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT bearer token used for authenticated admin endpoints"
      }
    },
    schemas: {
      RootResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Express API is running"
          }
        }
      },
      DatabaseStatus: {
        oneOf: [
          {
            type: "object",
            properties: {
              configured: {
                type: "boolean",
                example: false
              },
              connected: {
                type: "boolean",
                example: false
              },
              message: {
                type: "string",
                example: "Set DATABASE_URL in the .env file to enable PostgreSQL."
              }
            }
          },
          {
            type: "object",
            properties: {
              configured: {
                type: "boolean",
                example: true
              },
              connected: {
                type: "boolean",
                example: true
              },
              serverTime: {
                type: "string",
                format: "date-time",
                example: "2026-04-07T10:00:00.000Z"
              }
            }
          },
          {
            type: "object",
            properties: {
              configured: {
                type: "boolean",
                example: true
              },
              connected: {
                type: "boolean",
                example: false
              },
              message: {
                type: "string",
                example: "connect ECONNREFUSED 127.0.0.1:5432"
              }
            }
          }
        ]
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            example: "ok"
          },
          database: {
            $ref: "#/components/schemas/DatabaseStatus"
          }
        }
      },
      AdminLoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: {
            type: "string",
            example: "admin@brickpine.local",
            description: "Username, email address, or phone number"
          },
          password: {
            type: "string",
            example: "change-me"
          }
        }
      },
      AdminLoginResponse: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "brickpine-admin"
          },
          firstName: {
            type: "string",
            example: "BrickPine"
          },
          lastName: {
            type: "string",
            example: "SuperAdmin"
          },
          emailAddress: {
            type: "string",
            format: "email",
            example: "admin@brickpine.local"
          },
          userTypeId: {
            type: "integer",
            example: 4
          },
          token: {
            type: "string",
            example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-01-01T00:00:00.000Z"
          }
        }
      },
      AdminInviteRequest: {
        type: "object",
        required: ["email", "role", "firstName", "lastName"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "support-admin@brickpine.local"
          },
          role: {
            type: "string",
            enum: ["super_admin", "support", "finance"],
            example: "support"
          },
          firstName: {
            type: "string",
            example: "Jane"
          },
          lastName: {
            type: "string",
            example: "Doe"
          }
        }
      },
      AdminInviteResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Invite sent successfully"
          },
          inviteId: {
            type: "string",
            format: "uuid",
            example: "0f11ec2d-16ef-4ce3-a52e-6a4b73dc2c58"
          }
        }
      },
      AdminChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: {
            type: "string",
            example: "old-password"
          },
          newPassword: {
            type: "string",
            example: "new-secure-password"
          }
        }
      },
      AdminRevokeRequest: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            example: "Repeated policy violations"
          }
        }
      },
      AdminAccountSummary: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            example: "2c5d0f4f-814f-4941-9830-7c2f7d4e3f80"
          },
          username: {
            type: "string",
            example: "brickpine-admin"
          },
          role: {
            type: "string",
            enum: ["super_admin", "support", "finance"],
            example: "support"
          },
          status: {
            type: "string",
            enum: ["invited", "active", "suspended", "revoked"],
            example: "active"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-04-07T10:00:00.000Z"
          }
        }
      },
      AdminListResponse: {
        type: "object",
        properties: {
          admins: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminAccountSummary"
            }
          }
        }
      },
      PlatformWalletUserSummary: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 1
          },
          username: {
            type: "string",
            example: "brickpine"
          }
        }
      },
      PlatformWalletBalances: {
        type: "object",
        properties: {
          availableBalance: {
            type: "number",
            example: 20279.58
          },
          ledgerBalance: {
            type: "number",
            example: 4257.07
          }
        }
      },
      PlatformCommissionSummary: {
        type: "object",
        properties: {
          sellerCommissionTotal: {
            type: "number",
            example: 362987.5
          },
          logisticsCommissionTotal: {
            type: "number",
            example: 14158.38
          },
          totalCommission: {
            type: "number",
            example: 377145.88
          }
        }
      },
      PlatformWalletTransactionItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 91
          },
          amount: {
            type: "number",
            example: 2500
          },
          currency: {
            type: "string",
            example: "NGN"
          },
          transactionId: {
            type: "string",
            nullable: true,
            example: "HOLD_RELEASE:100:product:PLATFORM"
          },
          transactionType: {
            type: "integer",
            nullable: true,
            example: 2
          },
          description: {
            type: "string",
            nullable: true,
            example: "Holding release platform commission credit"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-04-08T09:15:00.000Z"
          }
        }
      },
      PlatformWalletOverviewResponse: {
        type: "object",
        properties: {
          platformUser: {
            $ref: "#/components/schemas/PlatformWalletUserSummary"
          },
          wallet: {
            $ref: "#/components/schemas/PlatformWalletBalances"
          },
          commissionSummary: {
            $ref: "#/components/schemas/PlatformCommissionSummary"
          },
          transactions: {
            type: "array",
            items: {
              $ref: "#/components/schemas/PlatformWalletTransactionItem"
            }
          }
        }
      },
      UserWalletResponse: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "buyer-one"
          },
          availableBalance: {
            type: "number",
            example: 2500
          },
          ledgerBalance: {
            type: "number",
            example: 3200
          },
          currency: {
            type: "string",
            example: "NGN"
          }
        }
      },
      ManualCreditWalletRequest: {
        type: "object",
        required: ["username", "amount", "description"],
        properties: {
          username: {
            type: "string",
            example: "buyer-one"
          },
          amount: {
            type: "number",
            example: 2500
          },
          description: {
            type: "string",
            example: "Manual adjustment for failed promotional payout"
          }
        }
      },
      ManualCreditWalletResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Wallet credited successfully"
          },
          newBalance: {
            type: "number",
            example: 4500
          }
        }
      },
      ManualDebitWalletRequest: {
        type: "object",
        required: ["username", "amount", "description"],
        properties: {
          username: {
            type: "string",
            example: "buyer-one"
          },
          amount: {
            type: "number",
            example: 500
          },
          description: {
            type: "string",
            example: "Manual reversal for failed wallet adjustment"
          }
        }
      },
      ManualDebitWalletResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Wallet debited successfully"
          },
          newBalance: {
            type: "number",
            example: 1500
          }
        }
      },
      DeliveryPricingRecord: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 4
          },
          state: {
            type: "string",
            example: "Abuja"
          },
          vehicleType: {
            type: "string",
            enum: ["bike", "car", "truck"],
            example: "bike"
          },
          baseFee: {
            type: "number",
            example: 1000
          }
        }
      },
      CreateDeliveryPricingRequest: {
        type: "object",
        required: ["state", "vehicleType", "baseFee"],
        properties: {
          state: {
            type: "string",
            example: "Lagos"
          },
          vehicleType: {
            type: "string",
            enum: ["bike", "car", "truck"],
            example: "bike"
          },
          baseFee: {
            type: "number",
            example: 1000
          }
        }
      },
      CreateDeliveryPricingResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Delivery pricing added successfully"
          },
          data: {
            $ref: "#/components/schemas/DeliveryPricingRecord"
          }
        }
      },
      UpdateDeliveryPricingRequest: {
        type: "object",
        properties: {
          state: {
            type: "string",
            example: "Abuja"
          },
          vehicleType: {
            type: "string",
            enum: ["bike", "car", "truck"],
            example: "car"
          },
          baseFee: {
            type: "number",
            example: 1200
          }
        }
      },
      UpdateDeliveryPricingResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Delivery pricing updated successfully"
          },
          data: {
            $ref: "#/components/schemas/DeliveryPricingRecord"
          }
        }
      },
      DeleteDeliveryPricingResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Pricing rule removed"
          }
        }
      },
      DeliverySurgeOverviewResponse: {
        type: "object",
        properties: {
          surgeFactor: {
            type: "number",
            example: 1.4
          },
          fuelSurcharge: {
            type: "number",
            example: 2.64
          },
          reason: {
            type: "string",
            nullable: true,
            example: "publicHoliday"
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: "2026-04-09T11:00:00.000Z"
          }
        }
      },
      UpdateDeliverySurgeRequest: {
        type: "object",
        required: ["surgeFactor"],
        properties: {
          surgeFactor: {
            type: "number",
            example: 1.5
          },
          fuelSurcharge: {
            type: "number",
            example: 12.75
          },
          reason: {
            type: "string",
            example: "High demand"
          }
        }
      },
      UpdateDeliverySurgeResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Surge updated"
          },
          surgeFactor: {
            type: "number",
            example: 1.5
          }
        }
      },
      DeliveryPricingListResponse: {
        type: "object",
        properties: {
          pricingRules: {
            type: "array",
            items: {
              $ref: "#/components/schemas/DeliveryPricingRecord"
            }
          }
        }
      },
      AdminSubscriptionPlan: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 1
          },
          name: {
            type: "string",
            nullable: true,
            example: "Basic"
          },
          description: {
            type: "string",
            nullable: true,
            example: "Seller starter plan"
          },
          price: {
            type: "number",
            nullable: true,
            example: 2500
          },
          currency: {
            type: "string",
            nullable: true,
            example: "NGN"
          },
          duration: {
            type: "integer",
            nullable: true,
            example: 1
          },
          maxProduct: {
            type: "integer",
            nullable: true,
            example: 50
          },
          maxMonthlyOrder: {
            type: "integer",
            nullable: true,
            example: 100
          },
          maxMonthlyDelivery: {
            type: "integer",
            nullable: true,
            example: 0
          },
          maxSocialPosts: {
            type: "integer",
            nullable: true,
            example: null
          },
          status: {
            type: "integer",
            nullable: true,
            example: 1
          }
        }
      },
      AdminSubscriptionsResponse: {
        type: "object",
        properties: {
          seller: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminSubscriptionPlan"
            }
          },
          logistics: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminSubscriptionPlan"
            }
          }
        }
      },
      CreateAdminSubscriptionPlanRequest: {
        type: "object",
        required: ["name", "type", "price"],
        properties: {
          name: {
            type: "string",
            example: "Premium"
          },
          type: {
            type: "string",
            enum: ["seller", "logistics"],
            example: "seller"
          },
          price: {
            type: "number",
            example: 120000
          },
          productLimit: {
            type: "integer",
            nullable: true,
            example: 500
          },
          monthlyOrderLimit: {
            type: "integer",
            nullable: true,
            example: 5000
          },
          features: {
            type: "array",
            items: {
              type: "string"
            },
            example: ["Priority support", "Unlimited analytics"]
          }
        }
      },
      CreatedAdminSubscriptionPlan: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 11
          },
          name: {
            type: "string",
            example: "Premium"
          },
          type: {
            type: "string",
            enum: ["seller", "logistics"],
            example: "seller"
          },
          price: {
            type: "number",
            example: 120000
          },
          currency: {
            type: "string",
            example: "NGN"
          },
          duration: {
            type: "integer",
            example: 12
          },
          productLimit: {
            type: "integer",
            nullable: true,
            example: 500
          },
          monthlyOrderLimit: {
            type: "integer",
            nullable: true,
            example: 5000
          },
          features: {
            type: "array",
            items: {
              type: "string"
            },
            example: ["Priority support", "Unlimited analytics"]
          },
          status: {
            type: "integer",
            example: 1
          }
        }
      },
      CreateAdminSubscriptionPlanResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Subscription plan created successfully"
          },
          plan: {
            $ref: "#/components/schemas/CreatedAdminSubscriptionPlan"
          }
        }
      },
      UpdateAdminSubscriptionPlanRequest: {
        type: "object",
        properties: {
          name: {
            type: "string",
            example: "Premium Plus"
          },
          price: {
            type: "number",
            format: "float",
            example: 150000
          },
          productLimit: {
            type: "integer",
            example: 600
          },
          monthlyOrderLimit: {
            type: "integer",
            example: 6000
          },
          features: {
            type: "array",
            items: {
              type: "string"
            },
            example: ["Priority support", "Weekend coverage"]
          }
        }
      },
      UpdateAdminSubscriptionPlanResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Plan updated"
          },
          plan: {
            $ref: "#/components/schemas/CreatedAdminSubscriptionPlan"
          }
        }
      },
      DeleteAdminSubscriptionPlanResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Plan removed"
          }
        }
      },
      GrantAdminSubscriptionRequest: {
        type: "object",
        required: ["subscriptionId"],
        properties: {
          subscriptionId: {
            type: "integer",
            example: 4
          },
          expiryDate: {
            type: "string",
            format: "date-time",
            example: "2027-04-09T00:00:00.000Z"
          }
        }
      },
      GrantAdminSubscriptionResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Subscription granted"
          }
        }
      },
      RevokeAdminSubscriptionRequest: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            example: "Manual adjustment"
          }
        }
      },
      RevokeAdminSubscriptionResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Subscription revoked"
          }
        }
      },
      AdminCampaignItem: {
        type: "object",
        properties: {
          campaignId: {
            type: "string",
            example: "13"
          },
          username: {
            type: "string",
            example: "seller-one"
          },
          goal: {
            type: "string",
            enum: ["awareness", "engagement", "conversion"],
            example: "engagement"
          },
          status: {
            type: "string",
            enum: [
              "draft",
              "pending_approval",
              "active",
              "paused",
              "completed",
              "rejected"
            ],
            example: "active"
          },
          budget: {
            type: "number",
            example: 5000
          },
          startDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: "2026-03-08T23:12:00.000Z"
          },
          endDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: "2026-03-23T23:12:00.000Z"
          }
        }
      },
      AdminCampaignsListResponse: {
        type: "object",
        properties: {
          campaigns: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminCampaignItem"
            }
          },
          total: {
            type: "integer",
            example: 13
          }
        }
      },
      AdminCampaignAnalyticsResponse: {
        type: "object",
        properties: {
          totalCampaigns: {
            type: "integer",
            example: 12
          },
          totalImpressions: {
            type: "integer",
            example: 1200
          },
          totalClicks: {
            type: "integer",
            example: 48
          },
          totalConversions: {
            type: "integer",
            example: 6
          },
          totalRevenue: {
            type: "number",
            example: 14500.5
          },
          ctr: {
            type: "number",
            example: 4
          }
        }
      },
      AdminSupportTicketItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 12
          },
          username: {
            type: "string",
            example: "mendes"
          },
          subject: {
            type: "string",
            example: "Payment not processed"
          },
          status: {
            type: "string",
            enum: ["open", "closed", "pending"],
            example: "open"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-10-30T15:00:23.000Z"
          }
        }
      },
      AdminSupportTicketsListResponse: {
        type: "object",
        properties: {
          tickets: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminSupportTicketItem"
            }
          },
          total: {
            type: "integer",
            example: 12
          }
        }
      },
      AdminSupportTicketMessageItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 1
          },
          message: {
            type: "string",
            example: "Still waiting for my payment"
          },
          attachment: {
            type: "string",
            nullable: true,
            example: "https://brickpine.nyc3.cdn.digitaloceanspaces.com/supportAttachment/example.png"
          },
          attachmentFileType: {
            type: "string",
            nullable: true,
            example: "image/png"
          },
          reply: {
            type: "boolean",
            example: false
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-10-30T14:58:53.000Z"
          }
        }
      },
      AdminSupportTicketDetails: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 3
          },
          username: {
            type: "string",
            example: "mendes"
          },
          subject: {
            type: "string",
            example: "Payment not processed"
          },
          messages: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminSupportTicketMessageItem"
            }
          },
          status: {
            type: "string",
            enum: ["open", "closed", "pending"],
            example: "open"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-10-30T15:00:23.000Z"
          }
        }
      },
      AdminSupportTicketDetailsResponse: {
        type: "object",
        properties: {
          ticket: {
            $ref: "#/components/schemas/AdminSupportTicketDetails"
          }
        }
      },
      AdminCampaignDetailsResponse: {
        type: "object",
        properties: {
          campaignId: {
            type: "string",
            example: "13"
          },
          username: {
            type: "string",
            example: "seller-one"
          },
          goal: {
            type: "string",
            enum: ["awareness", "engagement", "conversion"],
            example: "engagement"
          },
          status: {
            type: "string",
            enum: [
              "draft",
              "pending_approval",
              "active",
              "paused",
              "completed",
              "rejected"
            ],
            example: "active"
          },
          budget: {
            type: "number",
            example: 5000
          },
          impressions: {
            type: "integer",
            example: 1200
          },
          clicks: {
            type: "integer",
            example: 48
          },
          conversions: {
            type: "integer",
            example: 6
          },
          postId: {
            type: "string",
            example: "91"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-08T23:11:59.000Z"
          }
        }
      },
      ApproveAdminCampaignRequest: {
        type: "object",
        properties: {
          note: {
            type: "string",
            example: "Manual review passed"
          }
        }
      },
      ApproveAdminCampaignResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Campaign approved and is now active"
          }
        }
      },
      PauseAdminCampaignRequest: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            example: "Policy review in progress"
          }
        }
      },
      PauseAdminCampaignResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Campaign paused"
          }
        }
      },
      RejectAdminCampaignRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: {
            type: "string",
            example: "Budget claim does not match policy"
          }
        }
      },
      RejectAdminCampaignResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Campaign rejected"
          }
        }
      },
      AdminSettlementItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 1
          },
          username: {
            type: "string",
            example: "seller-one"
          },
          amount: {
            type: "number",
            example: 100.5
          },
          status: {
            type: "string",
            enum: ["pending", "approved", "rejected"],
            example: "pending"
          },
          description: {
            type: "string",
            nullable: true,
            example: "payment description"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-01-22T09:22:34.000Z"
          },
          settlementAccountId: {
            type: "integer",
            nullable: true,
            example: 1
          }
        }
      },
      AdminSettlementsListResponse: {
        type: "object",
        properties: {
          settlements: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminSettlementItem"
            }
          },
          total: {
            type: "integer",
            example: 1
          }
        }
      },
      AdminSettlementsStatsResponse: {
        type: "object",
        properties: {
          totalPending: {
            type: "integer",
            example: 4
          },
          totalApproved: {
            type: "integer",
            example: 12
          },
          totalRejected: {
            type: "integer",
            example: 2
          },
          pendingAmount: {
            type: "number",
            example: 45000.5
          },
          approvedAmount: {
            type: "number",
            example: 250000
          }
        }
      },
      AdminApproveSettlementRequest: {
        type: "object",
        required: ["username", "amount", "description", "settlementAccountId"],
        properties: {
          username: {
            type: "string",
            example: "seller-one"
          },
          amount: {
            type: "number",
            example: 100.5
          },
          description: {
            type: "string",
            example: "payment description"
          },
          settlementAccountId: {
            type: "integer",
            example: 1
          }
        }
      },
      AdminApproveSettlementResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Settlement successfully saved"
          }
        }
      },
      AdminRejectSettlementRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: {
            type: "string",
            example: "Settlement account details are invalid"
          }
        }
      },
      AdminRejectSettlementResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Settlement rejected"
          }
        }
      },
      AdminTransactionItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 173
          },
          userId: {
            type: "integer",
            example: 25
          },
          amount: {
            type: "number",
            example: 10403.01
          },
          currency: {
            type: "string",
            example: "NGN"
          },
          transactionId: {
            type: "string",
            nullable: true,
            example: "HOLD:X0i2sZMEkPwkh45t:DELIVERY:10115926"
          },
          transactionType: {
            type: "string",
            enum: ["credit", "debit"],
            example: "debit"
          },
          description: {
            type: "string",
            nullable: true,
            example: "Checkout hold for delivery funds"
          },
          status: {
            type: "integer",
            example: 1
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-24T20:47:55.000Z"
          }
        }
      },
      AdminTransactionsListResponse: {
        type: "object",
        properties: {
          transactions: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminTransactionItem"
            }
          },
          total: {
            type: "integer",
            example: 172
          }
        }
      },
      AdminTransactionDetailsResponse: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 173
          },
          userId: {
            type: "integer",
            example: 25
          },
          amount: {
            type: "number",
            example: 10403.01
          },
          currency: {
            type: "string",
            example: "NGN"
          },
          transactionId: {
            type: "string",
            example: "HOLD:X0i2sZMEkPwkh45t:DELIVERY:10115926"
          },
          settlementId: {
            type: "integer",
            nullable: true,
            example: 21
          },
          refundId: {
            type: "integer",
            nullable: true,
            example: null
          },
          transactionType: {
            type: "string",
            enum: ["credit", "debit"],
            example: "debit"
          },
          description: {
            type: "string",
            nullable: true,
            example: "Checkout hold for delivery funds"
          },
          ledgerBalance: {
            type: "number",
            example: 12000
          },
          availableBalance: {
            type: "number",
            example: 0
          },
          status: {
            type: "integer",
            example: 1
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-24T20:47:55.000Z"
          }
        }
      },
      CreateProductCategoryRequest: {
        type: "object",
        required: [
          "name",
          "description",
          "basicCommissionVat",
          "standardCommissionVat",
          "premiumCommissionVat"
        ],
        properties: {
          name: {
            type: "string",
            example: "Audio & Hifi"
          },
          description: {
            type: "string",
            example: "Audio devices and related products"
          },
          basicCommissionVat: {
            type: "number",
            example: 15.5
          },
          standardCommissionVat: {
            type: "number",
            example: 14
          },
          premiumCommissionVat: {
            type: "number",
            example: 13
          }
        }
      },
      UpdateProductCategoryRequest: {
        type: "object",
        properties: {
          name: {
            type: "string",
            example: "Updated Audio & Hifi"
          },
          description: {
            type: "string",
            example: "Updated audio devices and related products"
          },
          basicCommissionVat: {
            type: "number",
            example: 15
          },
          standardCommissionVat: {
            type: "number",
            example: 13.5
          },
          premiumCommissionVat: {
            type: "number",
            example: 12.5
          }
        }
      },
      ProductCategorySummary: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 7
          },
          name: {
            type: "string",
            example: "Audio & Hifi"
          },
          basicCommissionVat: {
            type: "number",
            example: 15.5
          },
          standardCommissionVat: {
            type: "number",
            example: 14
          },
          premiumCommissionVat: {
            type: "number",
            example: 13
          }
        }
      },
      ProductCategoryDetails: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 7
          },
          name: {
            type: "string",
            example: "Updated Audio & Hifi"
          },
          description: {
            type: "string",
            nullable: true,
            example: "Updated audio devices and related products"
          },
          basicCommissionVat: {
            type: "number",
            nullable: true,
            example: 15
          },
          standardCommissionVat: {
            type: "number",
            nullable: true,
            example: 13.5
          },
          premiumCommissionVat: {
            type: "number",
            nullable: true,
            example: 12.5
          }
        }
      },
      CreateProductCategoryResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Category created successfully"
          },
          productCategory: {
            $ref: "#/components/schemas/ProductCategorySummary"
          }
        }
      },
      UpdateProductCategoryResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Category updated successfully"
          },
          productCategory: {
            $ref: "#/components/schemas/ProductCategoryDetails"
          }
        }
      },
      ModerateProductRequest: {
        type: "object",
        required: ["reason", "action"],
        properties: {
          reason: {
            type: "string",
            example: "Counterfeit product listing"
          },
          action: {
            type: "string",
            enum: ["flag", "remove"],
            example: "flag"
          }
        }
      },
      ModerateProductResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Product flagged successfully"
          },
          productId: {
            type: "integer",
            example: 65
          }
        }
      },
      AdminProductSummary: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 65
          },
          name: {
            type: "string",
            nullable: true,
            example: "Sandwich Maker"
          },
          sellerUsername: {
            type: "string",
            nullable: true,
            example: "seller_117825241"
          },
          categoryId: {
            type: "integer",
            nullable: true,
            example: 7
          },
          categoryName: {
            type: "string",
            nullable: true,
            example: "Home Appliances"
          },
          price: {
            type: "number",
            nullable: true,
            example: 25000
          },
          currency: {
            type: "string",
            nullable: true,
            example: "NGN"
          },
          quantity: {
            type: "number",
            nullable: true,
            example: 12
          },
          status: {
            type: "string",
            enum: ["active", "flagged", "out_of_stock", "removed"],
            example: "active"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-04-08T12:00:00.000Z"
          }
        }
      },
      AdminProductsListResponse: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminProductSummary"
            }
          },
          total: {
            type: "integer",
            example: 65
          }
        }
      },
      AdminOrderSummary: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            example: 233
          },
          orderNumber: {
            type: "string",
            example: "X0i2sZMEkPwkh45t"
          },
          status: {
            type: "string",
            enum: ["pending", "picked_up", "in_transit", "delivered", "cancelled", "unknown"],
            example: "picked_up"
          },
          buyerUsername: {
            type: "string",
            nullable: true,
            example: "buyer-1"
          },
          sellerUsername: {
            type: "string",
            nullable: true,
            example: "hinocag"
          },
          logisticUsername: {
            type: "string",
            nullable: true,
            example: "rider"
          },
          vehicleType: {
            type: "string",
            nullable: true,
            example: "bike"
          },
          deliveryDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: null
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-24T20:47:54.000Z"
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-24T20:47:55.000Z"
          }
        }
      },
      AdminOrdersListResponse: {
        type: "object",
        properties: {
          orderDetails: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminOrderSummary"
            }
          },
          total: {
            type: "integer",
            example: 223
          }
        }
      },
      AdminOrderPartyDetails: {
        type: "object",
        properties: {
          username: {
            type: "string",
            nullable: true,
            example: "buyer-1"
          },
          firstName: {
            type: "string",
            nullable: true,
            example: "Jane"
          },
          lastName: {
            type: "string",
            nullable: true,
            example: "Doe"
          },
          emailAddress: {
            type: "string",
            nullable: true,
            format: "email",
            example: "jane.doe@example.com"
          },
          phoneNumber: {
            type: "string",
            nullable: true,
            example: "+2348012345678"
          }
        }
      },
      AdminOrderLogisticsDetails: {
        allOf: [
          {
            $ref: "#/components/schemas/AdminOrderPartyDetails"
          },
          {
            type: "object",
            properties: {
              vehicleType: {
                type: "string",
                nullable: true,
                example: "bike"
              },
              deliveryStatus: {
                type: "string",
                nullable: true,
                example: "assigned"
              }
            }
          }
        ]
      },
      AdminOrderItemDetails: {
        type: "object",
        properties: {
          cartId: {
            type: "integer",
            example: 317
          },
          productId: {
            type: "integer",
            nullable: true,
            example: 59
          },
          productName: {
            type: "string",
            nullable: true,
            example: "my product"
          },
          quantity: {
            type: "integer",
            example: 1
          },
          unitPrice: {
            type: "number",
            nullable: true,
            example: 1000
          },
          amount: {
            type: "number",
            nullable: true,
            example: 1000
          },
          currency: {
            type: "string",
            nullable: true,
            example: "NGN"
          },
          imageUrl: {
            type: "string",
            nullable: true,
            example: "https://cdn.example.com/product-59.png"
          },
          sku: {
            type: "string",
            nullable: true,
            example: "SKU-59"
          }
        }
      },
      AdminOrderDetails: {
        type: "object",
        properties: {
          orderNumber: {
            type: "string",
            example: "X0i2sZMEkPwkh45t"
          },
          status: {
            type: "string",
            enum: ["pending", "picked_up", "in_transit", "delivered", "cancelled", "unknown"],
            example: "picked_up"
          },
          buyer: {
            $ref: "#/components/schemas/AdminOrderPartyDetails"
          },
          seller: {
            $ref: "#/components/schemas/AdminOrderPartyDetails"
          },
          logistics: {
            $ref: "#/components/schemas/AdminOrderLogisticsDetails"
          },
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminOrderItemDetails"
            }
          },
          totalAmount: {
            type: "number",
            example: 1000
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-24T20:47:54.000Z"
          }
        }
      },
      AdminOrderDetailsResponse: {
        type: "object",
        properties: {
          orderStatus: {
            $ref: "#/components/schemas/AdminOrderDetails"
          }
        }
      },
      AdminOrderCancelRequest: {
        type: "object",
        required: ["orderIds"],
        properties: {
          orderIds: {
            type: "array",
            minItems: 1,
            items: {
              type: "integer",
              minimum: 1
            },
            example: [1, 6]
          },
          reason: {
            type: "string",
            nullable: true,
            example: "Fraud review"
          }
        }
      },
      AdminOrderCancelResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Order cancelled"
          }
        }
      },
      AdminOrderVolumeTrendPoint: {
        type: "object",
        properties: {
          date: {
            type: "string",
            example: "2026-04-08"
          },
          totalOrders: {
            type: "integer",
            example: 56
          }
        }
      },
      AdminOrdersStatsResponse: {
        type: "object",
        properties: {
          totalOrders: {
            type: "integer",
            example: 223
          },
          completed: {
            type: "integer",
            example: 140
          },
          cancelled: {
            type: "integer",
            example: 18
          },
          pending: {
            type: "integer",
            example: 22
          },
          completionRate: {
            type: "number",
            example: 62.78
          },
          trend: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AdminOrderVolumeTrendPoint"
            }
          }
        }
      },
      PlatformUserSummary: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "buyer-1"
          },
          firstName: {
            type: "string",
            example: "Jane"
          },
          lastName: {
            type: "string",
            example: "Doe"
          },
          emailAddress: {
            type: "string",
            format: "email",
            example: "jane.doe@example.com"
          },
          phoneNumber: {
            type: "string",
            example: "+2348012345678"
          },
          userTypeId: {
            type: "integer",
            enum: [1, 2, 3],
            example: 1
          },
          status: {
            type: "integer",
            enum: [1, 2],
            example: 1
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-04-07T10:00:00.000Z"
          }
        }
      },
      AdminUsersListResponse: {
        type: "object",
        properties: {
          users: {
            type: "array",
            items: {
              $ref: "#/components/schemas/PlatformUserSummary"
            }
          },
          total: {
            type: "integer",
            example: 135
          }
        }
      },
      PlatformUserGrowthTrendPoint: {
        type: "object",
        properties: {
          date: {
            type: "string",
            example: "2026-04-01"
          },
          newUsers: {
            type: "integer",
            example: 12
          }
        }
      },
      AdminUsersStatsResponse: {
        type: "object",
        properties: {
          totalUsers: {
            type: "integer",
            example: 1245
          },
          buyers: {
            type: "integer",
            example: 720
          },
          sellers: {
            type: "integer",
            example: 380
          },
          logistics: {
            type: "integer",
            example: 145
          },
          suspended: {
            type: "integer",
            example: 18
          },
          newUsersToday: {
            type: "integer",
            example: 7
          },
          growthTrend: {
            type: "array",
            items: {
              $ref: "#/components/schemas/PlatformUserGrowthTrendPoint"
            }
          }
        }
      },
      PendingKycSubmission: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "seller_117825241"
          },
          kycType: {
            type: "string",
            enum: [
              "individual_seller",
              "registered_company",
              "individual_logistic",
              "registered_logistic"
            ],
            example: "individual_seller"
          },
          status: {
            type: "string",
            enum: ["pending"],
            example: "pending"
          },
          submittedAt: {
            type: "string",
            format: "date-time",
            example: "2026-03-31T04:26:08.916Z"
          }
        }
      },
      KycFormStep: {
        type: "object",
        properties: {
          step: {
            type: "integer",
            example: 1
          },
          section: {
            type: "string",
            example: "identity"
          },
          fields: {
            type: "object",
            additionalProperties: true,
            example: {
              firstName: "Ato",
              lastName: "ade",
              emailAddress: "ato@gmail.com"
            }
          }
        }
      },
      UserKycSubmissionResponse: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "Hormo2urs"
          },
          kycType: {
            type: "string",
            enum: [
              "individual_seller",
              "registered_company",
              "individual_logistic",
              "registered_logistic"
            ],
            example: "registered_company"
          },
          status: {
            type: "string",
            enum: ["pending", "approved", "rejected"],
            example: "pending"
          },
          forms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/KycFormStep"
            }
          },
          submittedAt: {
            type: "string",
            format: "date-time",
            example: "2025-11-25T15:03:01.000Z"
          }
        }
      },
      ApproveKycResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "KYC status updated to approved"
          },
          username: {
            type: "string",
            example: "seller_117825241"
          }
        }
      },
      RejectKycRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: {
            type: "string",
            example: "Submitted documents do not match the registered business details"
          }
        }
      },
      RejectKycResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "KYC rejected"
          },
          username: {
            type: "string",
            example: "seller_117825241"
          }
        }
      },
      KycStatsResponse: {
        type: "object",
        properties: {
          totalPending: {
            type: "integer",
            example: 12
          },
          totalApproved: {
            type: "integer",
            example: 44
          },
          totalRejected: {
            type: "integer",
            example: 6
          },
          approvalRate: {
            type: "number",
            example: 70.97
          }
        }
      },
      PendingKycListResponse: {
        type: "object",
        properties: {
          submissions: {
            type: "array",
            items: {
              $ref: "#/components/schemas/PendingKycSubmission"
            }
          },
          total: {
            type: "integer",
            example: 14
          }
        }
      },
      PlatformUserBioSummary: {
        type: "object",
        properties: {
          bio: {
            type: "string",
            nullable: true,
            example: "Buyer bio"
          },
          profileImage: {
            type: "string",
            nullable: true,
            example: "https://cdn.example.com/profile.jpg"
          },
          coverImage: {
            type: "string",
            nullable: true,
            example: "https://cdn.example.com/cover.jpg"
          }
        }
      },
      PlatformUserSocialPostsSummary: {
        type: "object",
        properties: {
          total: {
            type: "integer",
            example: 0
          },
          latestCreatedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: null
          }
        }
      },
      PlatformUserFollowSummary: {
        type: "object",
        properties: {
          followers: {
            type: "integer",
            example: 0
          },
          following: {
            type: "integer",
            example: 0
          }
        }
      },
      PlatformUserProfileResponse: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "buyer-1"
          },
          firstName: {
            type: "string",
            example: "Jane"
          },
          lastName: {
            type: "string",
            example: "Doe"
          },
          emailAddress: {
            type: "string",
            format: "email",
            example: "jane.doe@example.com"
          },
          phoneNumber: {
            type: "string",
            example: "+2348012345678"
          },
          userTypeId: {
            type: "integer",
            enum: [1, 2, 3],
            example: 1
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-04-07T10:00:00.000Z"
          },
          social_posts: {
            $ref: "#/components/schemas/PlatformUserSocialPostsSummary"
          },
          follow: {
            $ref: "#/components/schemas/PlatformUserFollowSummary"
          },
          user_bio: {
            $ref: "#/components/schemas/PlatformUserBioSummary"
          }
        }
      },
      SuspendPlatformUserRequest: {
        type: "object",
        required: ["status", "comment"],
        properties: {
          status: {
            type: "integer",
            enum: [2],
            example: 2,
            description: "2 = suspended"
          },
          comment: {
            type: "string",
            example: "Repeated policy violations"
          }
        }
      },
      ActivatePlatformUserRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "integer",
            enum: [1],
            example: 1,
            description: "1 = active"
          },
          comment: {
            type: "string",
            example: "Review complete and account restored"
          }
        }
      },
      DeletePlatformUserRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: {
            type: "string",
            example: "Fraud confirmed after investigation"
          }
        }
      },
      MessageResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Password updated successfully"
          }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Invalid admin credentials"
          }
        }
      },
      ValidationErrorResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "username and password are required and must be non-empty strings"
          }
        }
      },
      ForbiddenErrorResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "Forbidden admin action"
          }
        }
      },
      ConflictErrorResponse: {
        type: "object",
        properties: {
          message: {
            type: "string",
            example: "An admin invite is already pending for this email address"
          }
        }
      }
    }
  },
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "Root status endpoint",
        responses: {
          "200": {
            description: "Basic API status response",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RootResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Application and database health",
        responses: {
          "200": {
            description: "Application health payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/wallet/platform": {
      get: {
        tags: ["Wallet & Transactions"],
        summary: "View platform wallet overview",
        description:
          "Returns the platform wallet identity, current wallet balances, aggregate commission totals, and recent platform wallet transactions for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "Platform wallet overview retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlatformWalletOverviewResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view the platform wallet",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Platform wallet user not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/wallet/manual_credit": {
      post: {
        tags: ["Wallet & Transactions"],
        summary: "Manually credit a user's wallet",
        description:
          "Credits a customer user's wallet balance, records a wallet transaction, and writes an admin audit log for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ManualCreditWalletRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Wallet credited successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ManualCreditWalletResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid manual wallet credit request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to credit user wallets",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Target user wallet not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Username lookup is ambiguous",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/wallet/manual_debit": {
      post: {
        tags: ["Wallet & Transactions"],
        summary: "Manually debit a user's wallet",
        description:
          "Debits a customer user's wallet balance, records a wallet transaction, and writes an admin audit log for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ManualDebitWalletRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Wallet debited successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ManualDebitWalletResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid manual wallet debit request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to debit user wallets",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Target user wallet not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Username lookup is ambiguous or the wallet balance is insufficient",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/delivery/pricing": {
      get: {
        tags: ["Delivery & Logistics"],
        summary: "List all delivery pricing configs",
        description:
          "Returns delivery pricing rules with optional state and vehicle-type filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "state",
            required: false,
            schema: {
              type: "string"
            },
            description: "Filter by state"
          },
          {
            in: "query",
            name: "vehicleType",
            required: false,
            schema: {
              type: "string",
              enum: ["bike", "car", "truck"]
            },
            description: "Filter by vehicle type"
          }
        ],
        responses: {
          "200": {
            description: "Delivery pricing configs retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeliveryPricingListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid delivery pricing query filters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view delivery pricing",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Delivery & Logistics"],
        summary: "Add delivery pricing (bike/car/truck per state)",
        description:
          "Creates a delivery pricing record for a state and vehicle type for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateDeliveryPricingRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Delivery pricing created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateDeliveryPricingResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid delivery pricing request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to create delivery pricing",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Delivery pricing already exists for the provided state and vehicle type",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/delivery/surge": {
      get: {
        tags: ["Delivery & Logistics"],
        summary: "View current surge pricing factors",
        description:
          "Returns the current delivery surge overview, preferring the explicit current surge configuration when present and otherwise falling back to the strongest active derived surge and fuel settings for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "Delivery surge overview retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeliverySurgeOverviewResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view delivery surge settings",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      },
      put: {
        tags: ["Delivery & Logistics"],
        summary: "Update surge multipliers",
        description:
          "Updates the current delivery surge configuration for authenticated super admin access while preserving optional values that are not supplied.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateDeliverySurgeRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Delivery surge updated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateDeliverySurgeResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid delivery surge update payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to update delivery surge settings",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/delivery/pricing/{id}": {
      put: {
        tags: ["Delivery & Logistics"],
        summary: "Update a delivery pricing entry",
        description:
          "Updates one or more fields on an existing delivery pricing record for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Delivery pricing record ID"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateDeliveryPricingRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Delivery pricing updated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateDeliveryPricingResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid delivery pricing update request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to update delivery pricing",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Delivery pricing record not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Delivery pricing already exists for the provided state and vehicle type",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Delivery & Logistics"],
        summary: "Remove a delivery pricing entry",
        description:
          "Deletes an existing delivery pricing record for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Delivery pricing record ID"
          }
        ],
        responses: {
          "200": {
            description: "Delivery pricing removed successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteDeliveryPricingResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid delivery pricing delete request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to delete delivery pricing",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Delivery pricing record not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/subscriptions": {
      get: {
        tags: ["Subscriptions"],
        summary: "List all subscription plans",
        description:
          "Returns the current seller and logistics subscription plans grouped by plan type for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "Subscription plans retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminSubscriptionsResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view subscription plans",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/subscriptions/plans": {
      post: {
        tags: ["Subscriptions"],
        summary: "Create a new subscription plan",
        description:
          "Creates a new active annual subscription plan for seller or logistics plans for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateAdminSubscriptionPlanRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Subscription plan created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateAdminSubscriptionPlanResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid subscription-plan creation payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to create subscription plans",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "An active annual subscription plan with this name and type already exists",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/subscriptions/plans/{id}": {
      put: {
        tags: ["Subscriptions"],
        summary: "Update a subscription plan",
        description:
          "Updates one or more editable fields on an existing subscription plan for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Subscription plan identifier"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAdminSubscriptionPlanRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Subscription plan updated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateAdminSubscriptionPlanResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid subscription-plan update payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to update subscription plans",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Subscription plan not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Subscription plan conflict",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Subscriptions"],
        summary: "Remove a subscription plan",
        description:
          "Removes an active subscription plan for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Subscription plan identifier"
          }
        ],
        responses: {
          "200": {
            description: "Subscription plan removed successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteAdminSubscriptionPlanResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid subscription-plan identifier",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to remove subscription plans",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Subscription plan not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/subscriptions/{username}/grant": {
      put: {
        tags: ["Subscriptions"],
        summary: "Manually grant a subscription to a user",
        description:
          "Creates a new active subscription grant for a platform user and moves any currently active subscription history rows to inactive status for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Target platform username"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GrantAdminSubscriptionRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Subscription granted successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GrantAdminSubscriptionResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid subscription grant payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to grant subscriptions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Target user or subscription plan not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Subscription grant conflict",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/subscriptions/{username}/revoke": {
      put: {
        tags: ["Subscriptions"],
        summary: "Revoke a user's subscription",
        description:
          "Moves any currently active subscription history rows for a platform user to inactive status for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Target platform username"
          }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RevokeAdminSubscriptionRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Subscription revoked successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RevokeAdminSubscriptionResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid subscription revoke payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to revoke subscriptions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Target user or active subscription not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Subscription revoke conflict",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns": {
      get: {
        tags: ["Ads & Promoted Posts"],
        summary: "List all promoted post campaigns",
        description:
          "Returns promoted post campaigns with optional status, username, and pagination filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: [
                "draft",
                "pending_approval",
                "active",
                "paused",
                "completed",
                "rejected"
              ]
            },
            description: "Optional campaign status filter"
          },
          {
            in: "query",
            name: "username",
            required: false,
            schema: {
              type: "string"
            },
            description: "Case-insensitive campaign owner username filter"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              default: 1,
              minimum: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              default: 20,
              minimum: 1,
              maximum: 100
            },
            description: "Pagination page size"
          }
        ],
        responses: {
          "200": {
            description: "Promoted campaigns returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminCampaignsListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaigns query filters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list promoted campaigns",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns/analytics": {
      get: {
        tags: ["Ads & Promoted Posts"],
        summary: "Platform-wide ads performance",
        description:
          "Returns aggregate promoted-post campaign performance metrics across the platform for authenticated super admin access, with optional date-range filtering.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "from",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive start date for campaign analytics"
          },
          {
            in: "query",
            name: "to",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive end date for campaign analytics"
          }
        ],
        responses: {
          "200": {
            description: "Campaign analytics returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminCampaignAnalyticsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaign analytics query filters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view campaign analytics",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/support/tickets": {
      get: {
        tags: ["Support & Tickets"],
        summary: "List all support tickets (all users)",
        description:
          "Returns support tickets across all platform users with optional status, username, support-category, and pagination filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: ["open", "closed", "pending"]
            },
            description: "Optional support-ticket status filter"
          },
          {
            in: "query",
            name: "username",
            required: false,
            schema: {
              type: "string"
            },
            description: "Case-insensitive ticket-owner username filter"
          },
          {
            in: "query",
            name: "categoryId",
            required: false,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Filter by support ticket category identifier"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              default: 1,
              minimum: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              default: 20,
              minimum: 1,
              maximum: 100
            },
            description: "Pagination page size"
          }
        ],
        responses: {
          "200": {
            description: "Support tickets returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminSupportTicketsListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid support-ticket query filters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list support tickets",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/support/tickets/{ticketId}": {
      get: {
        tags: ["Support & Tickets"],
        summary: "View a specific ticket",
        description:
          "Returns one support ticket with its reconstructed conversation thread for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "ticketId",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Support ticket identifier"
          }
        ],
        responses: {
          "200": {
            description: "Support ticket returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminSupportTicketDetailsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid support ticket identifier",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view support tickets",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Support ticket not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns/{campaignId}": {
      get: {
        tags: ["Ads & Promoted Posts"],
        summary: "View a specific campaign",
        description:
          "Returns one promoted post campaign with current aggregate campaign metrics for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "campaignId",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Promoted campaign identifier"
          }
        ],
        responses: {
          "200": {
            description: "Campaign returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminCampaignDetailsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaign identifier",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view campaign details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Campaign not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns/{campaignId}/approve": {
      put: {
        tags: ["Ads & Promoted Posts"],
        summary: "Approve a campaign before it goes live",
        description:
          "Activates a promoted post campaign for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "campaignId",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Promoted campaign identifier"
          }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApproveAdminCampaignRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Campaign approved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApproveAdminCampaignResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaign approval payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to approve campaigns",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Campaign not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Campaign cannot be approved in its current state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns/{campaignId}/reject": {
      put: {
        tags: ["Ads & Promoted Posts"],
        summary: "Reject a campaign",
        description:
          "Rejects a promoted post campaign and records the rejection reason for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "campaignId",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Promoted campaign identifier"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RejectAdminCampaignRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Campaign rejected successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RejectAdminCampaignResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaign rejection payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to reject campaigns",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Campaign not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Campaign cannot be rejected in its current state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/campaigns/{campaignId}/pause": {
      put: {
        tags: ["Ads & Promoted Posts"],
        summary: "Admin-force pause a campaign",
        description:
          "Pauses an active promoted post campaign for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "campaignId",
            required: true,
            schema: {
              type: "integer"
            },
            description: "Promoted campaign identifier"
          }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PauseAdminCampaignRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Campaign paused successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PauseAdminCampaignResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid campaign pause payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UnauthorizedErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to pause campaigns",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Campaign not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Campaign cannot be paused in its current state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/settlements": {
      get: {
        tags: ["Settlements"],
        summary: "List all settlement requests",
        description:
          "Returns paginated settlement requests with optional status and username filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: ["pending", "approved", "rejected"]
            },
            description: "Filter by settlement status"
          },
          {
            in: "query",
            name: "username",
            required: false,
            schema: {
              type: "string"
            },
            description: "Filter by user username"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          }
        ],
        responses: {
          "200": {
            description: "Settlement requests retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminSettlementsListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid settlement-list query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list settlement requests",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/settlements/stats": {
      get: {
        tags: ["Settlements"],
        summary: "Settlement volume and pending amounts",
        description:
          "Returns settlement counts and amount summaries across pending, approved, and rejected requests for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "Settlement stats retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminSettlementsStatsResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view settlement stats",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/settlements/{id}/approve": {
      put: {
        tags: ["Settlements"],
        summary: "Approve a settlement payout",
        description:
          "Approves a pending settlement request, updates the payout details, debits the beneficiary wallet, creates a settlement-linked wallet transaction, and writes an admin audit log for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Settlement request ID"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminApproveSettlementRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Settlement approved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminApproveSettlementResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid settlement-approval request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to approve settlements",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Settlement request not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Settlement request cannot be approved in its current state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/settlements/{id}/reject": {
      put: {
        tags: ["Settlements"],
        summary: "Reject a settlement with reason",
        description:
          "Rejects a pending settlement request and writes an admin rejection audit record for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Settlement request ID"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminRejectSettlementRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Settlement rejected successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminRejectSettlementResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid settlement-rejection request payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to reject settlements",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Settlement request not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Settlement request cannot be rejected in its current state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/transactions": {
      get: {
        tags: ["Wallet & Transactions"],
        summary: "List all platform transactions",
        description:
          "Returns paginated platform wallet transactions with optional user, transaction-type, and date filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "userId",
            required: false,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Filter by user ID"
          },
          {
            in: "query",
            name: "transactionType",
            required: false,
            schema: {
              type: "string",
              enum: ["credit", "debit"]
            },
            description: "Filter by transaction type"
          },
          {
            in: "query",
            name: "from",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Start date filter"
          },
          {
            in: "query",
            name: "to",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "End date filter"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          }
        ],
        responses: {
          "200": {
            description: "Platform transactions retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminTransactionsListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid transaction-list query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list platform transactions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/transactions/{transactionId}": {
      get: {
        tags: ["Wallet & Transactions"],
        summary: "View a specific transaction",
        description:
          "Returns the full wallet transaction details for a deterministic transaction reference for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "transactionId",
            required: true,
            schema: {
              type: "string"
            },
            description: "Deterministic wallet transaction reference"
          }
        ],
        responses: {
          "200": {
            description: "Transaction retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminTransactionDetailsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid transactionId path parameter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view platform transactions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Transaction not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Transaction reference is ambiguous",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/wallet/{username}": {
      get: {
        tags: ["Wallet & Transactions"],
        summary: "View any user's wallet",
        description:
          "Returns a customer user's wallet balances and currency for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Username of the customer wallet owner"
          }
        ],
        responses: {
          "200": {
            description: "User wallet retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserWalletResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view user wallets",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "User wallet not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Username lookup is ambiguous",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/auth/login": {
      post: {
        tags: ["Admin Auth"],
        summary: "Admin login (separate from customer login)",
        description:
          "Authenticates an active admin account with username, email address, or phone number and returns an admin JWT.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminLoginRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Admin login successful",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminLoginResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Invalid admin credentials",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/auth/invite": {
      post: {
        tags: ["Admin Auth"],
        summary: "Invite a new admin user",
        description:
          "Creates a pending admin invite, queues an invite email, and is restricted to authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminInviteRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Admin invite created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminInviteResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid request body or unsupported role",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to send invites",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Invite conflict for existing user, existing admin, or pending invite",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/auth/change_password": {
      put: {
        tags: ["Admin Auth"],
        summary: "Admin password change",
        description: "Allows an authenticated admin to change their own password.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminChangePasswordRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Password updated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid request body or password change request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/auth/admins": {
      get: {
        tags: ["Admin Auth"],
        summary: "List all admin accounts",
        description:
          "Returns the current admin directory and is restricted to authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "Admin accounts retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminListResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list admin accounts",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/auth/admins/{id}/revoke": {
      put: {
        tags: ["Admin Auth"],
        summary: "Revoke admin access",
        description:
          "Revokes a target admin account by changing its status to revoked and is restricted to authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "string",
              format: "uuid"
            },
            description: "UUID of the admin account to revoke"
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminRevokeRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Admin access revoked successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid admin id or revoke reason",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to revoke admin accounts",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Target admin account was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Admin revoke conflict such as self-revoke, already revoked, or last super admin",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/product/categories": {
      post: {
        tags: ["Product Management"],
        summary: "Create product category with commission VAT tiers",
        description:
          "Creates an active product category with required description and commission VAT percentages across the basic, standard, and premium tiers for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateProductCategoryRequest"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Product category created successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateProductCategoryResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid product category request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to create product categories",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "A product category with the same normalized name already exists",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/product/categories/{id}": {
      put: {
        tags: ["Product Management"],
        summary: "Update a product category",
        description:
          "Updates one or more fields on an existing product category for authenticated super admin access while preserving unspecified values.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Positive integer product category id"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateProductCategoryRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Product category updated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateProductCategoryResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid product category id or request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to update product categories",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Product category was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "A product category with the same normalized name already exists",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Product Management"],
        summary: "Delete a product category",
        description:
          "Deletes an existing product category for authenticated super admin access and blocks the deletion when linked products or category commission rows still reference that category.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Positive integer product category id"
          }
        ],
        responses: {
          "200": {
            description: "Product category deleted successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid product category id",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to delete product categories",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Product category was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Product category cannot be deleted because linked products or category commissions still exist",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/product/{productId}/flag": {
      put: {
        tags: ["Product Management"],
        summary: "Flag/remove a product violating policy",
        description:
          "Flags a product for policy review or soft-removes it from customer visibility by updating product moderation fields and recording an audit log for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "productId",
            required: true,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Positive integer product id"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ModerateProductRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Product moderation action applied successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModerateProductResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid product id or request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to moderate products",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Product was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Product moderation conflict such as already flagged or already removed",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/orders": {
      get: {
        tags: ["Order Management"],
        summary: "List all platform orders with filters",
        description:
          "Returns paginated platform orders with optional status, seller, buyer, and created-date filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: ["pending", "picked_up", "in_transit", "delivered", "cancelled"]
            },
            description: "Filter by order lifecycle status"
          },
          {
            in: "query",
            name: "sellerUsername",
            required: false,
            schema: {
              type: "string"
            },
            description: "Filter by seller username"
          },
          {
            in: "query",
            name: "buyerUsername",
            required: false,
            schema: {
              type: "string"
            },
            description: "Filter by buyer username"
          },
          {
            in: "query",
            name: "from",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive created-at start date filter"
          },
          {
            in: "query",
            name: "to",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive created-at end date filter"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          }
        ],
        responses: {
          "200": {
            description: "Orders retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminOrdersListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid order-list query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list orders",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/orders/stats": {
      get: {
        tags: ["Order Management"],
        summary: "Order volume and completion rates",
        description:
          "Returns aggregate order counts, completion rate, and a date-labelled order volume trend for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "period",
            required: false,
            schema: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              default: "monthly"
            },
            description: "Trend period bucket"
          }
        ],
        responses: {
          "200": {
            description: "Order stats retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminOrdersStatsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid order-stats query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view order stats",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/orders/{orderNumber}": {
      get: {
        tags: ["Order Management"],
        summary: "View full order details",
        description:
          "Returns the full order details for a single platform order, including buyer, seller, assigned logistics, line items, total amount, and creation timestamp for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "orderNumber",
            required: true,
            schema: {
              type: "string"
            },
            description: "The order number to fetch"
          }
        ],
        responses: {
          "200": {
            description: "Full order details returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminOrderDetailsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid order number",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view order details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Order not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/orders/{orderNumber}/cancel": {
      put: {
        tags: ["Order Management"],
        summary: "Admin-force cancel an order",
        description:
          "Cancels one or more selected order rows for the provided order number, optionally records a cancellation reason, updates linked deliveries when present, and records an admin audit log for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "orderNumber",
            required: true,
            schema: {
              type: "string"
            },
            description: "The order number whose selected order IDs should be cancelled"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminOrderCancelRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Order cancelled successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminOrderCancelResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid cancellation payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to cancel orders",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Order not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Selected order state does not allow cancellation",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/products": {
      get: {
        tags: ["Product Management"],
        summary: "List all products across all sellers",
        description:
          "Returns paginated products across sellers with optional seller-username, category, and computed-status filters for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "username",
            required: false,
            schema: {
              type: "string"
            },
            description: "Filter by seller username"
          },
          {
            in: "query",
            name: "categoryId",
            required: false,
            schema: {
              type: "integer",
              minimum: 1
            },
            description: "Filter by product category id"
          },
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: ["active", "flagged", "out_of_stock"]
            },
            description: "Filter by computed product status"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          }
        ],
        responses: {
          "200": {
            description: "Products retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminProductsListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid product-list query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list products",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/kyc/pending": {
      get: {
        tags: ["KYC Verification"],
        summary: "List all pending KYC submissions",
        description:
          "Returns the latest real pending KYC submission per seller or logistics user for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "type",
            required: false,
            schema: {
              type: "string",
              enum: [
                "individual_seller",
                "registered_company",
                "individual_logistic",
                "registered_logistic"
              ]
            },
            description:
              "Filter by derived KYC type: individual_seller, registered_company, individual_logistic, or registered_logistic"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          }
        ],
        responses: {
          "200": {
            description: "Pending KYC submissions retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PendingKycListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list pending KYC submissions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/kyc/stats": {
      get: {
        tags: ["KYC Verification"],
        summary: "KYC approval stats",
        description:
          "Returns aggregate KYC totals across the latest real seller and logistics submissions, including pending, approved, rejected, and approval rate, for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        responses: {
          "200": {
            description: "KYC stats returned successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/KycStatsResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view KYC stats",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/kyc/{username}": {
      get: {
        tags: ["KYC Verification"],
        summary: "View a user's full KYC submission",
        description:
          "Returns the latest full KYC submission for a seller or logistics user, including the grouped form sections, for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the user whose KYC submission should be viewed"
          }
        ],
        responses: {
          "200": {
            description: "Full KYC submission retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserKycSubmissionResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view user KYC submissions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "KYC submission was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Multiple users match the provided username",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/kyc/{username}/approve": {
      put: {
        tags: ["KYC Verification"],
        summary: "Approve KYC",
        description:
          "Approves the latest KYC submission for a seller or logistics user by updating the user's KYC status to approved for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the user whose KYC should be approved"
          }
        ],
        responses: {
          "200": {
            description: "KYC approved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApproveKycResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to approve KYC submissions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "KYC submission was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "KYC approval conflict such as duplicate username match or already approved",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/kyc/{username}/reject": {
      put: {
        tags: ["KYC Verification"],
        summary: "Reject KYC with reason",
        description:
          "Rejects the latest KYC submission for a seller or logistics user, requires a rejection reason, and records that reason for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the user whose KYC should be rejected"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RejectKycRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "KYC rejected successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RejectKycResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter or missing rejection reason",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to reject KYC submissions",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "KYC submission was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "KYC rejection conflict such as duplicate username match or already rejected",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/users": {
      get: {
        tags: ["User Management"],
        summary: "List all users",
        description:
          "Returns customer users filtered by user type, status, and created date, with paginated results for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "userTypeId",
            required: false,
            schema: {
              type: "integer",
              enum: [1, 2, 3]
            },
            description: "Filter by user type: 1 = buyer, 2 = seller, 3 = logistics"
          },
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "integer",
              enum: [1, 2]
            },
            description: "Filter by user status: 1 = active, 2 = suspended"
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              default: 1
            },
            description: "Pagination page number"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            description: "Results per page"
          },
          {
            in: "query",
            name: "from",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive created-at start date filter"
          },
          {
            in: "query",
            name: "to",
            required: false,
            schema: {
              type: "string",
              format: "date-time"
            },
            description: "Inclusive created-at end date filter"
          }
        ],
        responses: {
          "200": {
            description: "Users retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminUsersListResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to list users",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/users/stats": {
      get: {
        tags: ["User Management"],
        summary: "User growth stats & counts by type",
        description:
          "Returns user totals, status counts, and period-based growth trend data for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "query",
            name: "period",
            required: false,
            schema: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              default: "monthly"
            },
            description: "Growth trend bucket period"
          }
        ],
        responses: {
          "200": {
            description: "User stats retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminUsersStatsResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid stats query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view user stats",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/users/{username}": {
      get: {
        tags: ["User Management"],
        summary: "View full user profile",
        description:
          "Returns a full customer user profile by username for authenticated super admin access, including curated bio/profile data and placeholder social/follow summaries.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for a buyer, seller, or logistics user"
          }
        ],
        responses: {
          "200": {
            description: "User profile retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlatformUserProfileResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to view user profiles",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "User profile was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "Multiple users match the provided username",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ["User Management"],
        summary: "Hard delete a user",
        description:
          "Permanently deletes a buyer, seller, or logistics user by username, cleans up related user-linked records, and records the required deletion reason for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the user account to permanently delete"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeletePlatformUserRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "User account deleted successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter or request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to permanently delete users",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "User account was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "User deletion conflict such as duplicate username match",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/users/{username}/suspend": {
      put: {
        tags: ["User Management"],
        summary: "Suspend a user account",
        description:
          "Suspends a buyer, seller, or logistics user by username and records the required suspension comment for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the user account to suspend"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SuspendPlatformUserRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "User account suspended successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter or request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to suspend users",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "User account was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "User suspension conflict such as duplicate username match or already suspended",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/admin/users/{username}/activate": {
      put: {
        tags: ["User Management"],
        summary: "Reactivate a suspended account",
        description:
          "Reactivates a suspended buyer, seller, or logistics user by username and records an optional reactivation note for authenticated super admin access.",
        security: [
          {
            AdminBearerAuth: []
          }
        ],
        parameters: [
          {
            in: "path",
            name: "username",
            required: true,
            schema: {
              type: "string"
            },
            description: "Case-insensitive username lookup for the suspended user account to reactivate"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ActivatePlatformUserRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "User account reactivated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid username path parameter or request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Missing or invalid admin token",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Authenticated admin is not allowed to reactivate users",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ForbiddenErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "User account was not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            description: "User reactivation conflict such as duplicate username match or already active",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ConflictErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

export const swaggerUiOptions = {
  explorer: true,
  customSiteTitle: "BrickPine Admin API Docs",
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: "list"
  }
};

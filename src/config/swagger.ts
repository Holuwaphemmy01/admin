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
      name: "Product Management",
      description: "Administrative product and product-category management endpoints"
    },
    {
      name: "User Management",
      description: "Administrative customer-user management endpoints"
    },
    {
      name: "KYC Verification",
      description: "Administrative KYC review and verification endpoints"
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

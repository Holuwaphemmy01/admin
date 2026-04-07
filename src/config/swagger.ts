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
      name: "User Management",
      description: "Administrative customer-user management endpoints"
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

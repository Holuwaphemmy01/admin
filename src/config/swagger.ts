export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "BrickPine Admin API",
    version: "1.0.0",
    description:
      "Swagger documentation for the BrickPine admin monolith, including health endpoints and admin authentication."
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
                example: "2026-04-06T10:00:00.000Z"
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
          "Authenticates the embedded super admin with username, email address, or phone number and returns an admin JWT.",
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

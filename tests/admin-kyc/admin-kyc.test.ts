import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminKycRouter } from "../../src/modules/admin-kyc/routes";
import {
  approveUserKyc,
  ApproveUserKycConflictError,
  ApproveUserKycNotFoundError,
  ApproveUserKycValidationError,
  getUserKycSubmission,
  listPendingKycSubmissions,
  rejectUserKyc,
  RejectUserKycConflictError,
  RejectUserKycNotFoundError,
  RejectUserKycValidationError,
  UserKycSubmissionConflictError,
  UserKycSubmissionNotFoundError,
  UserKycSubmissionValidationError
} from "../../src/modules/admin-kyc/service";
import {
  RejectUserKycResponse,
  UserKycSubmissionResponse
} from "../../src/modules/admin-kyc/types";

async function startTestServer(application: ReturnType<typeof express>) {
  const server = application.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

function createQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    oid: 0,
    fields: [],
    rowCount: rows.length,
    rows
  };
}

function createTransactionClient(
  queryImplementation: (text: string, params?: unknown[]) => Promise<QueryResult<QueryResultRow>>
) {
  return {
    query: async <T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      const result = await queryImplementation(text, params);

      return result as unknown as QueryResult<T>;
    }
  };
}

function createAuthenticatedAdmin(
  overrides: Partial<AuthenticatedAdmin> = {}
): AuthenticatedAdmin {
  return {
    sub: "admin-user-id",
    scope: "admin",
    role: "super_admin",
    username: "brickpine-admin",
    emailAddress: "admin@brickpine.local",
    userTypeId: 4,
    passwordVersion: 1,
    ...overrides
  };
}

function allowAuthenticatedAdmin(
  admin: AuthenticatedAdmin = createAuthenticatedAdmin()
): RequestHandler {
  return (request, _response, next) => {
    request.admin = admin;
    next();
  };
}

test("listPendingKycSubmissions uses the latest real KYC submission per user and maps the response payload", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listPendingKycSubmissions(
    {
      page: 1,
      limit: 20
    },
    {
      queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([{ total: 2 }]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            username: "seller_117825241",
            kycType: "individual_seller",
            submittedAt: new Date("2026-03-31T04:26:08.916Z")
          },
          {
            username: "logistic_140941420",
            kycType: "registered_logistic",
            submittedAt: new Date("2026-03-31T04:26:12.744Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("WITH latest_kyc AS");
  expect(executedQueries[0]?.text).toContain("ROW_NUMBER() OVER");
  expect(executedQueries[0]?.text).toContain('u."kycStatus" = 0');
  expect(executedQueries[0]?.text).toContain('u."userTypeId" IN (2, 3)');
  expect(executedQueries[0]?.text).toContain('ORDER BY ps."submittedAt" DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(executedQueries[1]?.params).toEqual([]);
  expect(response).toEqual({
    submissions: [
      {
        username: "seller_117825241",
        kycType: "individual_seller",
        status: "pending",
        submittedAt: "2026-03-31T04:26:08.916Z"
      },
      {
        username: "logistic_140941420",
        kycType: "registered_logistic",
        status: "pending",
        submittedAt: "2026-03-31T04:26:12.744Z"
      }
    ],
    total: 2
  });
});

test("listPendingKycSubmissions applies the derived KYC type filter consistently to rows and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await listPendingKycSubmissions(
    {
      type: "registered_logistic",
      page: 2,
      limit: 10
    },
    {
      queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([{ total: 1 }]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('ps."kycType" = $1');
  expect(executedQueries[0]?.params).toEqual(["registered_logistic", 10, 10]);
  expect(executedQueries[1]?.params).toEqual(["registered_logistic"]);
});

test("getUserKycSubmission returns the latest KYC submission grouped into form sections", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getUserKycSubmission(" Hormo2urs ", {
    queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
      executedQueries.push({ text, params });

      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: 8,
            username: "Hormo2urs",
            userTypeId: 2,
            kycStatus: 3
          }
        ]) as unknown as QueryResult<T>;
      }

      return createQueryResult([
        {
          id: 13,
          completedStep: 3,
          createdAt: new Date("2025-11-25T15:03:01.000Z"),
          updatedAt: new Date("2026-02-23T12:41:04.000Z"),
          firstName: "Ato",
          lastName: "ade",
          emailAddress: "Ato@gmail.com",
          phoneNumber: "0937464383",
          residentialAddress: "Ikorodu garage market, Ikorodu, Nigeria",
          validId: "https://cdn.example.com/valid-id.png",
          validIdFileType: "image/png",
          bankName: "uba",
          accountName: "usssadf",
          accountNumber: "123121241241",
          bankStatement: "https://cdn.example.com/bank-statement.png",
          bankStatementFileType: "image/png",
          confirmAccuracy: true,
          privacyConsent: true,
          termsConsent: true,
          businessName: "Lionel",
          businessEmail: "akanbiomotoyosi@gmail.com",
          businessPhone: "8167626708",
          businessAddress: "hskskkmsmsmsm",
          authorizedRepresentativeName: "Omotoyosi",
          authorizedRepresentativePhone: "8167626708",
          authorizedRepresentativeEmail: "akanbiomotoyosi@gmail.com",
          tinNumber: null,
          cacCertificate: null,
          cacCertificateFileType: null,
          tinNumberCertificate: null,
          tinNumberCertificateFileType: null,
          age: null,
          profilePhoto: null,
          profilePhotoFileType: null,
          proofOfDrivingExperience: null,
          proofOfDrivingExperienceFileType: null,
          vehicleRegistrationDocument: null,
          vehicleRegistrationDocumentFileType: null,
          insuranceCertificate: null,
          insuranceCertificateFileType: null,
          roadWorthinessCertificate: null,
          roadWorthinessCertificateFileType: null,
          hackneyPermit: null,
          hackneyPermitFileType: null,
          vehicleType: "bike"
        },
        {
          id: 7,
          completedStep: 3,
          createdAt: new Date("2025-10-27T12:06:12.000Z"),
          updatedAt: new Date("2026-02-23T13:07:42.000Z"),
          firstName: "Alex",
          lastName: "ayo",
          emailAddress: "alexadepetu8@gmail.com",
          phoneNumber: "08012563985",
          residentialAddress: "Ikorodu garage market, Ikorodu, Nigeria",
          validId: "https://cdn.example.com/old-valid-id.png",
          validIdFileType: "image/png",
          bankName: "uba",
          accountName: "usssadf",
          accountNumber: "123121241241",
          bankStatement: "https://cdn.example.com/old-bank-statement.png",
          bankStatementFileType: "image/png",
          confirmAccuracy: true,
          privacyConsent: true,
          termsConsent: true,
          businessName: null,
          businessEmail: null,
          businessPhone: null,
          businessAddress: null,
          authorizedRepresentativeName: null,
          authorizedRepresentativePhone: null,
          authorizedRepresentativeEmail: null,
          tinNumber: null,
          cacCertificate: null,
          cacCertificateFileType: null,
          tinNumberCertificate: null,
          tinNumberCertificateFileType: null,
          age: null,
          profilePhoto: null,
          profilePhotoFileType: null,
          proofOfDrivingExperience: null,
          proofOfDrivingExperienceFileType: null,
          vehicleRegistrationDocument: null,
          vehicleRegistrationDocumentFileType: null,
          insuranceCertificate: null,
          insuranceCertificateFileType: null,
          roadWorthinessCertificate: null,
          roadWorthinessCertificateFileType: null,
          hackneyPermit: null,
          hackneyPermitFileType: null,
          vehicleType: "bike"
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.params).toEqual(["Hormo2urs"]);
  expect(executedQueries[1]?.params).toEqual([8]);
  expect(response).toEqual({
    username: "Hormo2urs",
    kycType: "registered_company",
    status: "rejected",
    submittedAt: "2025-11-25T15:03:01.000Z",
    forms: [
      {
        step: 1,
        section: "identity",
        fields: {
          firstName: "Ato",
          lastName: "ade",
          emailAddress: "Ato@gmail.com",
          phoneNumber: "0937464383",
          residentialAddress: "Ikorodu garage market, Ikorodu, Nigeria",
          validId: "https://cdn.example.com/valid-id.png",
          validIdFileType: "image/png"
        }
      },
      {
        step: 2,
        section: "banking",
        fields: {
          bankName: "uba",
          accountName: "usssadf",
          accountNumber: "123121241241",
          bankStatement: "https://cdn.example.com/bank-statement.png",
          bankStatementFileType: "image/png",
          confirmAccuracy: true,
          privacyConsent: true,
          termsConsent: true
        }
      },
      {
        step: 3,
        section: "business_verification",
        fields: {
          businessName: "Lionel",
          businessEmail: "akanbiomotoyosi@gmail.com",
          businessPhone: "8167626708",
          businessAddress: "hskskkmsmsmsm",
          authorizedRepresentativeName: "Omotoyosi",
          authorizedRepresentativePhone: "8167626708",
          authorizedRepresentativeEmail: "akanbiomotoyosi@gmail.com",
          tinNumber: null,
          cacCertificate: null,
          cacCertificateFileType: null,
          tinNumberCertificate: null,
          tinNumberCertificateFileType: null
        }
      }
    ]
  });
});

test("getUserKycSubmission derives individual logistics submissions and rejects invalid username states", async () => {
  const response = await getUserKycSubmission(" logistic_140941420 ", {
    queryFn: async <T extends QueryResultRow>(text: string) => {
      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: 176,
            username: "logistic_140941420",
            userTypeId: 3,
            kycStatus: 0
          }
        ]) as unknown as QueryResult<T>;
      }

      return createQueryResult([
        {
          id: 35,
          completedStep: 5,
          createdAt: new Date("2026-03-31T04:26:12.744Z"),
          updatedAt: new Date("2026-03-31T04:26:14.482Z"),
          firstName: "John",
          lastName: "Doe",
          emailAddress: "john@example.com",
          phoneNumber: "+2348012345678",
          residentialAddress: "Lagos",
          validId: "https://cdn.example.com/id.png",
          validIdFileType: "image/png",
          bankName: "GTB",
          accountName: "John Doe",
          accountNumber: "8165253939",
          bankStatement: "https://cdn.example.com/statement.png",
          bankStatementFileType: "image/png",
          confirmAccuracy: true,
          privacyConsent: true,
          termsConsent: true,
          businessName: null,
          businessEmail: null,
          businessPhone: null,
          businessAddress: null,
          authorizedRepresentativeName: null,
          authorizedRepresentativePhone: null,
          authorizedRepresentativeEmail: null,
          tinNumber: null,
          cacCertificate: null,
          cacCertificateFileType: null,
          tinNumberCertificate: null,
          tinNumberCertificateFileType: null,
          age: 30,
          profilePhoto: "https://cdn.example.com/profile.png",
          profilePhotoFileType: "image/png",
          proofOfDrivingExperience: "https://cdn.example.com/experience.png",
          proofOfDrivingExperienceFileType: "image/png",
          vehicleRegistrationDocument: "https://cdn.example.com/vehicle.png",
          vehicleRegistrationDocumentFileType: "image/png",
          insuranceCertificate: "https://cdn.example.com/insurance.png",
          insuranceCertificateFileType: "image/png",
          roadWorthinessCertificate: "https://cdn.example.com/roadworthy.png",
          roadWorthinessCertificateFileType: "image/png",
          hackneyPermit: "https://cdn.example.com/hackney.png",
          hackneyPermitFileType: "image/png",
          vehicleType: "bike"
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(response.kycType).toBe("individual_logistic");
  expect(response.status).toBe("pending");
  expect(response.forms[response.forms.length - 1]).toEqual({
    step: 3,
    section: "logistics_verification",
    fields: {
      age: 30,
      profilePhoto: "https://cdn.example.com/profile.png",
      profilePhotoFileType: "image/png",
      proofOfDrivingExperience: "https://cdn.example.com/experience.png",
      proofOfDrivingExperienceFileType: "image/png",
      vehicleRegistrationDocument: "https://cdn.example.com/vehicle.png",
      vehicleRegistrationDocumentFileType: "image/png",
      insuranceCertificate: "https://cdn.example.com/insurance.png",
      insuranceCertificateFileType: "image/png",
      roadWorthinessCertificate: "https://cdn.example.com/roadworthy.png",
      roadWorthinessCertificateFileType: "image/png",
      hackneyPermit: "https://cdn.example.com/hackney.png",
      hackneyPermitFileType: "image/png",
      vehicleType: "bike"
    }
  });

  await expect(
    getUserKycSubmission("   ", {
      queryFn: async <T extends QueryResultRow>() => createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(UserKycSubmissionValidationError);

  await expect(
    getUserKycSubmission("missing-user", {
      queryFn: async <T extends QueryResultRow>() => createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(UserKycSubmissionNotFoundError);

  await expect(
    getUserKycSubmission("duplicate-user", {
      queryFn: async <T extends QueryResultRow>(text: string) => {
        if (text.includes('FROM public."user" u')) {
          return createQueryResult([
            {
              id: 1,
              username: "Duplicate-User",
              userTypeId: 2,
              kycStatus: 0
            },
            {
              id: 2,
              username: "duplicate-user",
              userTypeId: 3,
              kycStatus: 0
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    })
  ).rejects.toThrow(UserKycSubmissionConflictError);

  await expect(
    getUserKycSubmission("submission-less-user", {
      queryFn: async <T extends QueryResultRow>(text: string) => {
        if (text.includes('FROM public."user" u')) {
          return createQueryResult([
            {
              id: 42,
              username: "submission-less-user",
              userTypeId: 2,
              kycStatus: 1
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    })
  ).rejects.toThrow(UserKycSubmissionNotFoundError);
});

test("approveUserKyc updates the user's KYC status to approved and returns the canonical username", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await approveUserKyc(
    {
      username: " seller_117825241 "
    },
    {
      nowFactory: () => new Date("2026-04-08T12:00:00.000Z"),
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes('FROM public."user" u')) {
              return createQueryResult([
                {
                  id: 175,
                  username: "seller_117825241",
                  userTypeId: 2,
                  kycStatus: 0
                }
              ]);
            }

            if (text.includes("FROM public.kyc k")) {
              return createQueryResult([
                {
                  id: 34
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "KYC status updated to approved",
    username: "seller_117825241"
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual(["seller_117825241"]);
  expect(executedQueries[2]?.text).toContain('UPDATE public."user"');
  expect(executedQueries[2]?.params).toEqual([1, new Date("2026-04-08T12:00:00.000Z"), 175]);
});

test("approveUserKyc rejects invalid usernames, missing submissions, duplicate users, and already-approved KYC", async () => {
  await expect(
    approveUserKyc({
      username: "   "
    })
  ).rejects.toThrow(ApproveUserKycValidationError);

  await expect(
    approveUserKyc(
      {
        username: "missing-user"
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(ApproveUserKycNotFoundError);

  await expect(
    approveUserKyc(
      {
        username: "duplicate-user"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 1,
                    username: "Duplicate-User",
                    userTypeId: 2,
                    kycStatus: 0
                  },
                  {
                    id: 2,
                    username: "duplicate-user",
                    userTypeId: 3,
                    kycStatus: 0
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(ApproveUserKycConflictError);

  await expect(
    approveUserKyc(
      {
        username: "submission-less-user"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 42,
                    username: "submission-less-user",
                    userTypeId: 2,
                    kycStatus: 0
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(ApproveUserKycNotFoundError);

  await expect(
    approveUserKyc(
      {
        username: "approved-user"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 35,
                    username: "approved-user",
                    userTypeId: 2,
                    kycStatus: 1
                  }
                ]);
              }

              if (text.includes("FROM public.kyc k")) {
                return createQueryResult([
                  {
                    id: 77
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("KYC is already approved");
});

test("rejectUserKyc updates the user's KYC status to rejected, records the reason, and returns the canonical username", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await rejectUserKyc(
    {
      username: " seller_117825241 ",
      reason: "  Submitted documents do not match the registered business details  ",
      rejectedByAdminId: "admin-user-id"
    },
    {
      nowFactory: () => new Date("2026-04-08T13:00:00.000Z"),
      uuidFactory: () => "kyc-rejection-audit-id",
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes('FROM public."user" u')) {
              return createQueryResult([
                {
                  id: 175,
                  username: "seller_117825241",
                  userTypeId: 2,
                  kycStatus: 0
                }
              ]);
            }

            if (text.includes("FROM public.kyc k")) {
              return createQueryResult([
                {
                  id: 34
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "KYC rejected",
    username: "seller_117825241"
  });
  expect(executedQueries).toHaveLength(4);
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual(["seller_117825241"]);
  expect(executedQueries[2]?.text).toContain('UPDATE public."user"');
  expect(executedQueries[2]?.params).toEqual([3, new Date("2026-04-08T13:00:00.000Z"), 175]);
  expect(executedQueries[3]?.text).toContain("INSERT INTO public.kyc_rejection_audit_logs");
  expect(executedQueries[3]?.params).toEqual([
    "kyc-rejection-audit-id",
    175,
    34,
    "admin-user-id",
    "Submitted documents do not match the registered business details",
    new Date("2026-04-08T13:00:00.000Z")
  ]);
});

test("rejectUserKyc rejects invalid input, missing submissions, duplicate users, and already-rejected KYC", async () => {
  await expect(
    rejectUserKyc({
      username: "   ",
      reason: "Reason",
      rejectedByAdminId: "admin-user-id"
    })
  ).rejects.toThrow(RejectUserKycValidationError);

  await expect(
    rejectUserKyc({
      username: "seller_117825241",
      reason: "   ",
      rejectedByAdminId: "admin-user-id"
    })
  ).rejects.toThrow("reason is required and must be a non-empty string");

  await expect(
    rejectUserKyc({
      username: "seller_117825241",
      reason: "Reason",
      rejectedByAdminId: "   "
    })
  ).rejects.toThrow("rejectedByAdminId must be a non-empty string");

  await expect(
    rejectUserKyc(
      {
        username: "missing-user",
        reason: "Reason",
        rejectedByAdminId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(RejectUserKycNotFoundError);

  await expect(
    rejectUserKyc(
      {
        username: "duplicate-user",
        reason: "Reason",
        rejectedByAdminId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 1,
                    username: "Duplicate-User",
                    userTypeId: 2,
                    kycStatus: 0
                  },
                  {
                    id: 2,
                    username: "duplicate-user",
                    userTypeId: 3,
                    kycStatus: 0
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(RejectUserKycConflictError);

  await expect(
    rejectUserKyc(
      {
        username: "submission-less-user",
        reason: "Reason",
        rejectedByAdminId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 42,
                    username: "submission-less-user",
                    userTypeId: 2,
                    kycStatus: 0
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(RejectUserKycNotFoundError);

  await expect(
    rejectUserKyc(
      {
        username: "rejected-user",
        reason: "Reason",
        rejectedByAdminId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user" u')) {
                return createQueryResult([
                  {
                    id: 35,
                    username: "rejected-user",
                    userTypeId: 2,
                    kycStatus: 3
                  }
                ]);
              }

              if (text.includes("FROM public.kyc k")) {
                return createQueryResult([
                  {
                    id: 77
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("KYC is already rejected");
});

test("GET /admin/kyc/pending returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/pending`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/approve returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/approve`, {
      method: "PUT"
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/reject returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/reject`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/:username returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/Hormo2urs`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/approve returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      approveUserKycHandler: async () => ({
        message: "KYC status updated to approved",
        username: "seller_117825241"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/reject returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      rejectUserKycHandler: async () => ({
        message: "KYC rejected",
        username: "seller_117825241"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listPendingKycSubmissionsHandler: async () => ({
        submissions: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/pending`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/approve returns 404 and 409 for missing or conflicting approvals", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveUserKycHandler: async ({ username }) => {
        if (username === "missing-user") {
          throw new ApproveUserKycNotFoundError("KYC submission not found");
        }

        throw new ApproveUserKycConflictError("KYC is already approved");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/missing-user/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);

    response = await fetch(`${server.baseUrl}/admin/kyc/approved-user/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/reject returns 404 and 409 for missing or conflicting rejections", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectUserKycHandler: async ({ username }) => {
        if (username === "missing-user") {
          throw new RejectUserKycNotFoundError("KYC submission not found");
        }

        throw new RejectUserKycConflictError("KYC is already rejected");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/missing-user/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(404);

    response = await fetch(`${server.baseUrl}/admin/kyc/rejected-user/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/approve validates the username path parameter", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveUserKycHandler: async ({ username }) => {
        if (username.trim() === "") {
          throw new ApproveUserKycValidationError("username must be a non-empty string");
        }

        throw new Error("This handler should not be called for non-blank usernames");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/%20%20/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("username must be a non-empty string");
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/reject validates the username path parameter and required reason", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectUserKycHandler: async ({ username }) => {
        if (username.trim() === "") {
          throw new RejectUserKycValidationError("username must be a non-empty string");
        }

        throw new Error("This handler should not be called for non-blank usernames");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/%20%20/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(400);

    let payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("username must be a non-empty string");

    response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "   "
      })
    });

    expect(response.status).toBe(400);

    payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("reason is required and must be a non-empty string");
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/:username returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getUserKycSubmissionHandler: async () => ({
        username: "Hormo2urs",
        kycType: "registered_company",
        status: "rejected",
        forms: [],
        submittedAt: "2025-11-25T15:03:01.000Z"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/Hormo2urs`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/approve returns the updated approval payload for super admins", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveUserKycHandler: async ({ username }) => {
        expect(username).toBe("seller_117825241");

        return {
          message: "KYC status updated to approved",
          username: "seller_117825241"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "KYC status updated to approved",
      username: "seller_117825241"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/kyc/:username/reject returns the updated rejection payload for super admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectUserKycHandler: async ({
        username,
        reason,
        rejectedByAdminId
      }): Promise<RejectUserKycResponse> => {
        expect(username).toBe("seller_117825241");
        expect(reason).toBe("Submitted documents do not match");
        expect(rejectedByAdminId).toBe("admin-user-id");

        return {
          message: "KYC rejected",
          username: "seller_117825241"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/seller_117825241/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Submitted documents do not match"
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "KYC rejected",
      username: "seller_117825241"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending validates query parameters", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPendingKycSubmissionsHandler: async () => ({
        submissions: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/pending?type=buyer`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/kyc/pending?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/kyc/pending?limit=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/:username returns 404 and 409 for missing or ambiguous usernames", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserKycSubmissionHandler: async (username) => {
        if (username === "missing-user") {
          throw new UserKycSubmissionNotFoundError("KYC submission not found");
        }

        throw new UserKycSubmissionConflictError("Multiple users match the provided username");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/missing-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);

    response = await fetch(`${server.baseUrl}/admin/kyc/duplicate-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/:username validates the username path parameter", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserKycSubmissionHandler: async (username) => {
        if (username.trim() === "") {
          throw new UserKycSubmissionValidationError("username must be a non-empty string");
        }

        throw new Error("This handler should not be called for non-blank usernames");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("username must be a non-empty string");
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending parses filters, defaults page, caps limit, and returns pending submissions", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPendingKycSubmissionsHandler: async (filters) => {
        expect(filters.type).toBe("registered_company");
        expect(filters.page).toBe(1);
        expect(filters.limit).toBe(100);

        return {
          submissions: [
            {
              username: "seller_117825241",
              kycType: "registered_company",
              status: "pending",
              submittedAt: "2026-03-31T04:26:08.916Z"
            }
          ],
          total: 1
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/kyc/pending?type=registered_company&limit=200`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      submissions: Array<Record<string, unknown>>;
      total: number;
    };

    expect(payload.total).toBe(1);
    expect(payload.submissions).toEqual([
      {
        username: "seller_117825241",
        kycType: "registered_company",
        status: "pending",
        submittedAt: "2026-03-31T04:26:08.916Z"
      }
    ]);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/:username returns the latest full KYC submission payload for super admins", async () => {
  const application = express();
  const userKycSubmissionResponse: UserKycSubmissionResponse = {
    username: "Hormo2urs",
    kycType: "registered_company",
    status: "rejected",
    forms: [
      {
        step: 1,
        section: "identity",
        fields: {
          firstName: "Ato",
          lastName: "ade"
        }
      },
      {
        step: 2,
        section: "banking",
        fields: {
          bankName: "uba",
          accountNumber: "123121241241"
        }
      }
    ],
    submittedAt: "2025-11-25T15:03:01.000Z"
  };

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserKycSubmissionHandler: async (username) => {
        expect(username).toBe("Hormo2urs");

        return userKycSubmissionResponse;
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/Hormo2urs`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.username).toBe("Hormo2urs");
    expect(payload.kycType).toBe("registered_company");
    expect(payload.status).toBe("rejected");
    expect(payload.submittedAt).toBe("2025-11-25T15:03:01.000Z");
    expect(payload.forms).toEqual([
      {
        step: 1,
        section: "identity",
        fields: {
          firstName: "Ato",
          lastName: "ade"
        }
      },
      {
        step: 2,
        section: "banking",
        fields: {
          bankName: "uba",
          accountNumber: "123121241241"
        }
      }
    ]);
  } finally {
    await server.close();
  }
});

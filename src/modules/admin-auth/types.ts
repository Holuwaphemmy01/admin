export interface AdminLoginRequestBody {
  username: string;
  password: string;
}

export interface AdminLoginResponse {
  username: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userTypeId: number;
  token: string;
  createdAt?: string;
}

export interface AuthenticatedAdmin {
  sub: "env:super-admin";
  scope: "admin";
  role: "super_admin";
  username: string;
  emailAddress: string;
  userTypeId: number;
}

export interface AdminJwtPayload extends AuthenticatedAdmin {
  iat: number;
  exp: number;
  iss: "brickpine-admin";
  aud: "admin-api";
}

export interface AdminAuthConfig {
  superAdmin: {
    username: string;
    emailAddress: string;
    phoneNumber: string;
    password: string;
    firstName: string;
    lastName: string;
    userTypeId: number;
    createdAt?: string;
    normalizedUsername: string;
    normalizedEmailAddress: string;
    normalizedPhoneNumber: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: "brickpine-admin";
    audience: "admin-api";
    subject: "env:super-admin";
    scope: "admin";
    role: "super_admin";
  };
}

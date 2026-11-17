// Shared auth constants. No server-only import: client forms use the password length too.

export const MIN_PASSWORD_LENGTH = 12;

/** Failed sign-ins for one email within the window that lock that email for the rest of the window. */
export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

/** Invitation links are valid for this many days unless the inviter chooses otherwise. */
export const INVITATION_DEFAULT_DAYS = 7;

/** Internal error codes thrown from Better Auth hooks, mapped to user-facing messages by the service. */
export const AUTH_ERROR = {
  LOCKED: "ACCOUNT_LOCKED",
  DEACTIVATED: "ACCOUNT_DEACTIVATED",
} as const;

/** Audit actions written by the auth module. */
export const AUTH_AUDIT = {
  LOGIN: "auth.login",
  LOGIN_FAILED: "auth.login_failed",
  LOGOUT: "auth.logout",
  SESSION_EXPIRED: "auth.session_expired",
  MFA_ENROL: "auth.mfa_enrol",
  TERMS_ACCEPT: "user.terms_accept",
  REGISTER: "user.register",
  APPROVE: "user.approve",
  INVITATION_CREATE: "invitation.create",
  INVITATION_ACCEPT: "invitation.accept",
} as const;

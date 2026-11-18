import type { UserRole } from "@/generated/prisma/enums";

// How roles are named on screen (PLAN v0.3 section 4). One list for every page, so a new role cannot be missed.

export const ROLE_LABEL: Record<UserRole, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  SUMMIT_ADMIN: "Summit team",
  COUNTRY: "Country focal point",
  WBG_COORDINATOR: "WBG coordinator",
  INVESTOR: "Investor or operator",
};

/** What each role can do, as a hint in the admin form. */
export const ROLE_HINT: Record<UserRole, string> = {
  PLATFORM_ADMIN: "Terra: everything technical, support and audit export.",
  SUMMIT_ADMIN:
    "Countries, focal points, project details, publishing, accounts and exports.",
  COUNTRY:
    "Sees and manages the projects and meeting requests of the chosen countries.",
  WBG_COORDINATOR:
    "Follows the meeting requests of the chosen countries and is copied on their notifications.",
  INVESTOR:
    "Sees and downloads all published teasers and requests meetings, after accepting the investor acknowledgement.",
};

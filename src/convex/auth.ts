// The template's auth file, extended with the Password provider required by
// RecurPro (email + password signup/signin). The existing OTP and guest
// providers are left untouched.
//
// Rules enforced here, server-side, on every credential flow:
//  - emails are stored lowercased, so uniqueness is case-insensitive
//  - passwords must pass the shared policy (>= 9 chars, upper, lower, symbol)
//  - public signup can only ever create a CUSTOMER: the role literal is
//    hard-coded below, so a client can never send its own role.
import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { emailOtp } from "./auth/emailOtp";
import { ROLES } from "../shared/enums";
import { assertPasswordPolicy, normalizeEmail } from "../shared/validation";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    emailOtp,
    Anonymous,
    Password({
      validatePasswordRequirements: assertPasswordPolicy,
      profile: (params) => {
        const rawName = params.name;
        const name =
          typeof rawName === "string" && rawName.trim().length > 0
            ? rawName.trim().slice(0, 80)
            : "";
        return {
          email: normalizeEmail(String(params.email ?? "")),
          name,
          role: ROLES.CUSTOMER,
          isActive: true,
        };
      },
    }),
  ],
});

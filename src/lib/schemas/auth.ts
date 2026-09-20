import { z } from "zod";

// One schema, imported by the login form AND the signIn server action.
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

// ---------------------------------------------------------------- password change (A3.4)

const newPassword = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

export const setPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, "Type the password again"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match" });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const forcePasswordResetSchema = z.object({
  userId: z.guid(),
  /** Optional. When given, it replaces their password; either way they must change it at next sign-in. */
  temporaryPassword: z.union([z.literal(""), newPassword]).optional(),
});
export type ForcePasswordResetInput = z.infer<typeof forcePasswordResetSchema>;

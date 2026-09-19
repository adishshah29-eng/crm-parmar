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

# Password reset

Two ways for someone to get back in. Read the last section first: **email reset does not work until Adish configures email in Supabase.**

## 1. Self-service: the email link

`/login` → "Forgot your password?" → `/reset-password` → email → link → `/auth/confirm` → `/set-password`.

1. The person enters their work email. The screen always says the same thing whether or not the address has an account, so it cannot be used to discover who works here.
2. Supabase emails a one-time link. It points at `/auth/confirm?token_hash=…&type=recovery`.
3. `src/app/auth/confirm/route.ts` verifies the token, signs them in, and sends them to `/set-password`. Only `recovery` links are accepted (it is not a general sign-in door) and `?next=` is restricted to same-site paths.
4. They choose a new password. The link works once.

### Configuration this needs (Supabase dashboard, not a migration)

**Authentication → URL Configuration**
- Site URL: the production address once it exists (for now `http://localhost:3000`).
- Redirect URLs: add `http://localhost:3000/**` and, later, the production domain.

**Authentication → Emails → Reset Password template.** Replace the link so it goes through our callback:

```html
<h2>Reset your password</h2>
<p>Follow this link to choose a new password:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password">Reset password</a></p>
```

**Authentication → SMTP Settings.** This is the part people miss. Supabase's built-in email sender only delivers to members of your Supabase organisation and is heavily rate-limited (a handful of emails per hour). It will **not** email callers and managers. Before go-live, configure a real SMTP provider (any transactional email service) and use a sender address on the company domain. None of this is in the repo, so record what you chose in `08-decisions.md`.

## 2. Forced change by the super admin

`/users/[id]` → **Password** → "Require password change".

- Optionally type a **temporary password**. It replaces their current one immediately.
- Either way the person is held on `/set-password` at their next sign-in and cannot reach anything else until they choose a new password. The proxy enforces this on every request, including server actions.
- The flag lives in the Supabase auth user's `app_metadata.must_reset_password`, not in a table (the data model has none, and the brain forbids inventing schema). `app_metadata` can only be written with the admin API, which is deliberate: a user can edit their own `user_metadata`, so a flag kept there could be cleared without changing the password.
- It is cleared only after the new password is really saved.
- Not allowed on yourself (use **Change password**) or on a deactivated user.

**This is a process control, not a security boundary.** It stops a flagged person using the app. Their existing sign-in token can still call the database directly until it expires, and RLS is unchanged.

## 3. Until email is configured

Use the forced change with a temporary password:

1. Super admin opens the person's user page, types a temporary password, clicks **Require password change**.
2. Give the temporary password to the person privately (in person, or a private message; never a group chat or the repo).
3. They sign in with it and are immediately asked for a new one.

Anyone can also change their own password at any time from **Change password** in the top bar.

## Things to know

- The service key is needed for the forced change and to clear the flag afterwards, so `SUPABASE_SERVICE_ROLE_KEY` must be set in every environment that serves the app, including Vercel. Without it, the email flow still works but a forced change can neither be set nor cleared.
- Password rules: 8 to 72 characters. Supabase enforces its own minimum too.

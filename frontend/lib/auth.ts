import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND_COLOR = "#c84a20";
const FROM_ADDRESS = "Habermolt <noreply@habermolt.email>";

function emailWrapper(bodyHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f5f5; padding: 32px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="padding: 32px 32px 0; text-align: center;">
                  <span style="font-size: 28px;">&#x1F99E;</span>
                  <h1 style="margin: 8px 0 0; font-size: 20px; color: ${BRAND_COLOR};">Habermolt</h1>
                </td>
              </tr>
              ${bodyHtml}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [],
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: user.email,
        subject: "Reset your password - Habermolt",
        html: emailWrapper(`
          <tr>
            <td style="padding: 24px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Reset your password</h2>
              <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
                We received a request to reset the password for your Habermolt account.
                Click the button below to choose a new password.
              </p>
              <div style="text-align: center; margin: 0 0 24px;">
                <a href="${url}"
                   style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 28px;
                          border-radius: 6px; text-decoration: none; font-weight: 600;">
                  Reset Password
                </a>
              </div>
              <p style="color: #888; font-size: 13px; margin: 0;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        `),
      });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: user.email,
        subject: "Verify your email - Habermolt",
        html: emailWrapper(`
          <tr>
            <td style="padding: 24px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Verify your email</h2>
              <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
                Thanks for signing up for Habermolt! Please verify your email address
                to get started.
              </p>
              <div style="text-align: center; margin: 0 0 24px;">
                <a href="${url}"
                   style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 28px;
                          border-radius: 6px; text-decoration: none; font-weight: 600;">
                  Verify Email
                </a>
              </div>
              <p style="color: #888; font-size: 13px; margin: 0;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        `),
      });
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    twitter: {
      clientId: process.env.X_CLIENT_ID!,
      clientSecret: process.env.X_CLIENT_SECRET!,
    },
  },
});

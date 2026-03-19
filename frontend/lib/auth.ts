import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND_COLOR = "#c84a20";
const FROM_ADDRESS = "Habermolt <noreply@habermolt.email>";
const FRONTEND_URL = process.env.BETTER_AUTH_URL || "https://habermolt.com";
const LOBSTERS_URL = "https://www.habermolt.com/invite/vq0rINDjAhJBE_LvaDGc5g?ref=CvT_uxc8Sg";

async function sendWelcomeEmail(email: string, name?: string | null) {
  const firstName = name?.split(" ")[0] || "there";
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Welcome to Habermolt",
      html: emailWrapper(`
        <tr>
          <td style="padding: 24px 32px;">
            <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Welcome to Habermolt, ${firstName}!</h2>
            <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
              Habermolt is a platform where AI agents deliberate on topics on behalf of their humans.
              Your agent (we call them lobsters) will learn your values and represent you in discussions
              about the topics you care about.
            </p>
            <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
              To kick things off, join our <strong>Launch Day Lobsters</strong> community deliberation
              &mdash; a space for early adopters to share feedback and shape what Habermolt becomes.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
              <a href="${LOBSTERS_URL}"
                 style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 28px;
                        border-radius: 6px; text-decoration: none; font-weight: 600;">
                Join Launch Day Lobsters
              </a>
            </div>
            <p style="color: #888; font-size: 13px; margin: 0;">
              Next step: <a href="${FRONTEND_URL}/create-agent" style="color: ${BRAND_COLOR};">Create your lobster</a>
              to start participating in deliberations.
            </p>
          </td>
        </tr>
      `),
    });
  } catch (e) {
    console.error("Failed to send welcome email:", e);
  }
}

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
    max: 3,  // Vercel serverless: keep pool small to avoid exhausting PG connection limit
    idleTimeoutMillis: 20000,  // Close idle connections after 20s
    connectionTimeoutMillis: 10000,  // Fail fast if PG is unreachable
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
    sendVerificationEmail: async ({ user, url: rawUrl }: { user: { email: string }; url: string }) => {
      // Rewrite the callbackURL inside the verification link so the frontend
      // can show a "verified" toast when the user lands after clicking it.
      const url = rawUrl.replace(
        /callbackURL=[^&]*/,
        "callbackURL=" + encodeURIComponent("/?verified=true"),
      );
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
    afterEmailVerification: async (user) => {
      // Email+password users: send welcome email right after they verify
      await sendWelcomeEmail(user.email, user.name);
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // OAuth users: emailVerified is true at creation time (Google/Twitter)
          // Email+password users: emailVerified is false here, they get the welcome
          // email via afterEmailVerification instead
          if (user.emailVerified) {
            await sendWelcomeEmail(user.email, user.name);
          }
        },
      },
    },
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

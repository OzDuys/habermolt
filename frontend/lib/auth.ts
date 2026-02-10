import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await resend.emails.send({
        from: "Habermolt <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your email - Habermolt",
        html: `
          <h2>Welcome to Habermolt</h2>
          <p>Click the link below to verify your email address:</p>
          <a href="${url}">Verify Email</a>
          <p>If you didn&apos;t create an account, you can ignore this email.</p>
        `,
      });
    },
    sendOnSignUp: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

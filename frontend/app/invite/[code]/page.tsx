import type { Metadata } from "next";
import InvitePageClient from "./InvitePageClient";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

type Props = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/deliberations/invite/${code}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        title: "Habermolt - Join Deliberation",
        robots: { index: false, follow: false },
      };
    }

    const data = await res.json();
    const question: string = data.question;
    const title = `Deliberate: "${question}"`;
    const description = `You're invited to weigh in on "${question}" — join the conversation and help find common ground.`;

    return {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        images: [{ url: "/logo.png" }],
        type: "website",
      },
      twitter: {
        card: "summary",
        title,
        description,
        images: ["/logo.png"],
      },
    };
  } catch {
    return {
      title: "Habermolt - Join Deliberation",
      robots: { index: false, follow: false },
    };
  }
}

export default function InvitePage() {
  return <InvitePageClient />;
}

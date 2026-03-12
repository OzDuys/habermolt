import type { Metadata } from "next";
import DeliberationPageClient from "./DeliberationPageClient";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/deliberations/${id}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        title: "Habermolt - Deliberation",
      };
    }

    const data = await res.json();
    const question: string = data.question;
    const title = `Deliberate: "${question}"`;
    const description = `Join the deliberation on "${question}" — AI agents finding common ground through democratic consensus.`;

    return {
      title,
      description,
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
      title: "Habermolt - Deliberation",
    };
  }
}

export default function DeliberationPage() {
  return <DeliberationPageClient />;
}

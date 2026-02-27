"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import CreateAgentFlow from "@/components/CreateAgentFlow";

export default function CreateAgentPage() {
  return (
    <Suspense fallback={<div />}>
      <CreateAgentPageContent />
    </Suspense>
  );
}

function CreateAgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in");
      return;
    }
    // Check if agent already exists
    fetch("/api/hosted-agent").then((res) => {
      if (res.status !== 404) {
        router.push("/profile");
      } else {
        setReady(true);
      }
    });
  }, [session, isPending, router]);

  if (isPending || !ready) return null;
  return <CreateAgentFlow />;
}

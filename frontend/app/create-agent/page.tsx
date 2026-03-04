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
  const [isUpdate, setIsUpdate] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in");
      return;
    }
    // Check if agent already exists
    fetch("/api/hosted-agent").then(async (res) => {
      if (res.status === 404) {
        setReady(true);
        return;
      }
      if (!res.ok) {
        setReady(true);
        return;
      }
      const data = await res.json();
      if (data.has_profile) {
        // Agent already has a profile — no need for wizard
        router.push("/profile");
      } else {
        // Bare agent exists but no profile — allow wizard in update mode
        setIsUpdate(true);
        setReady(true);
      }
    });
  }, [session, isPending, router]);

  if (isPending || !ready) return null;
  return <CreateAgentFlow isUpdate={isUpdate} />;
}

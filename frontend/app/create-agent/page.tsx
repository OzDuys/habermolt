"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import CreateAgentFlow from "@/components/CreateAgentFlow";
import { api } from "@/lib/api";

export default function CreateAgentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="animate-pulse" style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--surface-dim)" }} />
      </div>
    }>
      <CreateAgentPageContent />
    </Suspense>
  );
}

function CreateAgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [defaultName, setDefaultName] = useState("");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in");
      return;
    }
    // Check if agent already exists
    api.getMyHostedAgent().then((data) => {
      if (!data) {
        // No agent yet — derive default name from user's name
        const firstName = session.user.name?.split(" ")[0] || "";
        if (firstName) setDefaultName(`${firstName}'s Lobster`);
        setReady(true);
        return;
      }
      if (data.onboarded) {
        // Agent already onboarded — no need for wizard
        router.push("/settings");
      } else {
        // Bare agent exists — use its current display_name as default
        setDefaultName(data.display_name || "");
        setIsUpdate(true);
        setReady(true);
      }
    });
  }, [session, isPending, router]);

  if (isPending || !ready) return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="animate-pulse" style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--surface-dim)" }} />
    </div>
  );
  return <CreateAgentFlow isUpdate={isUpdate} defaultName={defaultName} />;
}

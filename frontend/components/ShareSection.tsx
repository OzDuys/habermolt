"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { appendReferralCode } from "@/lib/referral";
import { trackShareCopy } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";

/** Hook that fetches the current user's referral code (if signed in). */
function useReferralCode(): string | null {
  const { data: session } = useSession();
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.user?.id) return;
    api.getMyReferralCode().then(r => setCode(r.code)).catch(() => {});
  }, [session?.user?.id]);
  return code;
}

interface ShareButtonProps {
  url: string;
}

// Legacy inline share component used by create page
export function ShareSection({ url }: { url: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const refCode = useReferralCode();
  const shareUrl = useMemo(() => refCode ? appendReferralCode(url, refCode) : url, [url, refCode]);

  useEffect(() => {
    QRCode.toDataURL(shareUrl, { width: 200, margin: 2, color: { dark: "#000", light: "#fff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [shareUrl]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      trackShareCopy("share-section");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {qrDataUrl && (
        <img src={qrDataUrl} alt="QR Code" style={{ width: 120, height: 120, borderRadius: 8 }} />
      )}
      <button
        onClick={handleCopy}
        style={{
          padding: "4px 10px", borderRadius: 999, border: "1.5px solid rgba(0,0,0,0.08)",
          background: copied ? "#1a8a5010" : "rgba(255,255,255,0.8)",
          cursor: "pointer", fontSize: 11, color: copied ? "#1a8a50" : "#555",
        }}
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const refCode = useReferralCode();
  const shareUrl = useMemo(() => refCode ? appendReferralCode(url, refCode) : url, [url, refCode]);

  useEffect(() => {
    QRCode.toDataURL(shareUrl, { width: 200, margin: 2, color: { dark: "#000", light: "#fff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [shareUrl]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      trackShareCopy("share-button");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  const handleDownloadQR = useCallback(() => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "deliberation-qr.png";
    a.click();
  }, [qrDataUrl]);

  return (
    <div ref={popoverRef} style={{ position: "relative" }}>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(!open)}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: "1.5px solid rgba(0,0,0,0.08)",
          background: open ? "rgba(200,74,32,0.08)" : "rgba(255,255,255,0.6)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, color: "#666", transition: "all 0.2s",
        }}
        aria-label="Share deliberation"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
              padding: 16, minWidth: 200, zIndex: 100,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
              Share
            </div>

            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR Code" style={{ width: 120, height: 120, borderRadius: 8 }} />
            )}

            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <button
                onClick={handleCopy}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10,
                  border: "1.5px solid rgba(0,0,0,0.08)",
                  background: copied ? "#1a8a5010" : "rgba(255,255,255,0.8)",
                  cursor: "pointer", fontSize: 12, color: copied ? "#1a8a50" : "#555",
                  fontWeight: 500,
                }}
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
              {qrDataUrl && (
                <button
                  onClick={handleDownloadQR}
                  style={{
                    padding: "8px 12px", borderRadius: 10,
                    border: "1.5px solid rgba(0,0,0,0.08)",
                    background: "rgba(255,255,255,0.8)", cursor: "pointer",
                    fontSize: 12, color: "#555", fontWeight: 500,
                  }}
                >
                  Save QR
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

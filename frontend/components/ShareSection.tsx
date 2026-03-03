"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";

interface ShareSectionProps {
  url: string;
  label?: string;
  compact?: boolean;
}

export default function ShareSection({ url, label, compact }: ShareSectionProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: "#000", light: "#fff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [url]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  const handleDownloadQR = useCallback(() => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "deliberation-qr.png";
    a.click();
  }, [qrDataUrl]);

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {qrDataUrl && (
          <img src={qrDataUrl} alt="QR Code" style={{ width: 120, height: 120, borderRadius: 8 }} />
        )}
        <div style={{ display: "flex", gap: 6 }}>
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
          {qrDataUrl && (
            <button
              onClick={handleDownloadQR}
              style={{
                padding: "4px 10px", borderRadius: 999, border: "1.5px solid rgba(0,0,0,0.08)",
                background: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 11, color: "#555",
              }}
            >
              Save QR
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      padding: "14px 20px", borderRadius: 16,
      background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(0,0,0,0.05)",
      width: "100%", maxWidth: 400,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#1a8a50", fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a8a50", display: "inline-block" }} />
        Your agent is participating
      </div>
      {label && (
        <div style={{ fontSize: 11, color: "#999", textAlign: "center" }}>{label}</div>
      )}
      {qrDataUrl && (
        <img src={qrDataUrl} alt="QR Code" style={{ width: 140, height: 140, borderRadius: 8 }} />
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleCopy}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 999, border: "1.5px solid rgba(0,0,0,0.08)",
            background: copied ? "#1a8a5010" : "rgba(255,255,255,0.8)",
            cursor: "pointer", fontSize: 12, color: copied ? "#1a8a50" : "#555",
          }}
        >
          {copied ? "Copied!" : "Copy Link"}
        </button>
        {qrDataUrl && (
          <button
            onClick={handleDownloadQR}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 999, border: "1.5px solid rgba(0,0,0,0.08)",
              background: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 12, color: "#555",
            }}
          >
            Save QR
          </button>
        )}
      </div>
    </div>
  );
}

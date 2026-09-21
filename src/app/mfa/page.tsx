"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import EyesLogo from "@/components/common/EyesLogo";

const GRID = 28;

function GridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<{ x: number; y: number }>({ x: -999, y: -999 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener("resize", resize);

    const mm = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", mm);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      
      const cols = Math.ceil(w / GRID);
      const rows = Math.ceil(h / GRID);

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = i * GRID;
          const y = j * GRID;

          const dx = mouse.current.x - x;
          const dy = mouse.current.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const maxDist = 150;
          let r = 1;

          if (dist < maxDist) {
            const intensity = 1 - dist / maxDist;
            r = 1 + intensity * 1.5;
            ctx.fillStyle = `rgba(224, 106, 59, ${0.1 + intensity * 0.4})`;
          } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", mm);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

function OTPInput({ value, onChange, disabled, error }: { value: string, onChange: (v: string) => void, disabled?: boolean, error?: boolean }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first empty input on mount or if value clears
  useEffect(() => {
    if (!value && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newVal = value.split("");
      if (newVal[index]) {
        // If current box has a value, delete it
        newVal[index] = "";
      } else if (index > 0) {
        // If empty, delete the previous box and move focus back
        newVal[index - 1] = "";
        inputRefs.current[index - 1]?.focus();
      }
      onChange(newVal.join(""));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (index > 0) inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (index < 5) inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.replace(/\D/g, "");
    if (!val) return;
    
    // Handle paste if multiple characters are somehow registered in onChange
    if (val.length > 1) {
      const pasted = val.slice(0, 6);
      onChange((value.substring(0, index) + pasted).slice(0, 6));
      return;
    }

    const newVal = value.split("");
    newVal[index] = val;
    const finalVal = newVal.join("");
    onChange(finalVal);

    if (index < 5 && val) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      if (pasted.length === 6) {
        inputRefs.current[5]?.focus();
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    }
  };

  return (
    <div style={{ display: "flex", gap: "12px", justifyContent: "center", width: "100%" }}>
      {[...Array(6)].map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          disabled={disabled}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onChange={(e) => handleChange(e, i)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: "52px",
            height: "64px",
            fontSize: "28px",
            fontWeight: 500,
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1.5px solid",
            borderColor: error ? "rgba(239, 68, 68, 0.5)" : (value[i] ? "rgba(224,106,59,0.5)" : "#333"),
            borderRadius: "12px",
            color: "#fff",
            fontFamily: "var(--font-mono)",
            outline: "none",
            transition: "all 0.2s ease",
            boxShadow: value[i] && !error ? "0 0 15px rgba(224,106,59,0.15)" : "none",
          }}
        />
      ))}
    </div>
  );
}

export default function MfaPage() {
  const router = useRouter();
  const { verifyMfa, supabase, logout } = useAuth();
  
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [backHovered, setBackHovered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Fetch the required factor ID on mount
  useEffect(() => {
    const checkExistingMfaRequirement = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        const { data: factorData } = await supabase.auth.mfa.listFactors();
        if (factorData) {
          const totpFactor = factorData.all.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');
          if (totpFactor) {
            setMfaFactorId(totpFactor.id);
            return;
          }
        }
        setError("MFA required but no verified factors found.");
      } else if (aalData?.currentLevel === 'aal2') {
        // Already fully authenticated
        router.replace('/');
      } else {
        // Not required
        router.replace('/login');
      }
    };
    checkExistingMfaRequirement();
  }, [supabase, router]);

  // Unified verify function
  const performVerification = useCallback(async (code: string) => {
    if (code.length !== 6 || !mfaFactorId || isLoading) return;
    
    setError("");
    setIsLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) {
        setError(challengeError.message);
        setIsLoading(false);
        return;
      }
      
      const result = await verifyMfa(mfaFactorId, challengeData.id, code);
      if (result.success) {
        router.push("/");
      } else {
        setError(result.message || "Invalid authentication code.");
        setMfaCode(""); // Clear code so user can try again
      }
    } catch (err) {
      setError("An unexpected network error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [mfaFactorId, isLoading, verifyMfa, router, supabase]);

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (mfaCode.length === 6 && mfaFactorId && !isLoading) {
      performVerification(mfaCode);
    }
  }, [mfaCode, mfaFactorId, isLoading, performVerification]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <GridCanvas />

      {/* Main navigation (Cancel / Logout) */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        zIndex: 10,
      }}>
        <button
          onClick={() => logout()}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
            color: backHovered ? "#fff" : "#555", fontSize: "10px",
            fontFamily: "var(--font-sans)", letterSpacing: "0.12em",
            transition: "color 0.2s",
            fontWeight: 500,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          CANCEL LOGIN
        </button>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 5,
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <EyesLogo width={110} height={26} />
        </div>

        <h1 style={{
          fontSize: "28px",
          fontWeight: 400,
          color: "#fff",
          marginBottom: 12,
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.02em"
        }}>
          Verify your identity
        </h1>
        
        <p style={{
          fontSize: "14px",
          color: "#888",
          marginBottom: 40,
          fontFamily: "var(--font-sans)",
          lineHeight: 1.5,
        }}>
          Please enter the 6-digit code generated by your<br/>authenticator application.
        </p>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "10px",
            padding: "10px 12px",
            color: "#ef4444",
            fontSize: "12px",
            textAlign: "center",
            marginBottom: "24px",
            fontFamily: "var(--font-sans)",
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 32 }}>
          <OTPInput
            value={mfaCode}
            onChange={setMfaCode}
            disabled={isLoading || !mfaFactorId}
            error={!!error}
          />
        </div>

        {/* Loading Indicator (replaces Verify button) */}
        <div style={{
          height: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isLoading ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}>
          <div style={{
            width: "20px",
            height: "20px",
            border: "2px solid rgba(255,255,255,0.1)",
            borderTopColor: "#E06A3B",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 100% { transform: rotate(360deg); } }
          `}} />
        </div>

      </div>
    </div>
  );
}

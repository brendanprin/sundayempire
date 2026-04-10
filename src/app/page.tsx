import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui";

export default function LandingPage() {
  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      {/* Header / Top Bar */}
      <header className="border-b px-6 py-5" style={{ borderColor: "var(--brand-structure-muted)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Image
            src="/brand/wordmark/sundayempire-logo-primary-wordmark.png"
            alt="SundayEmpire"
            width={200}
            height={53}
            priority
          />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="primary" size="lg" className="text-lg px-8 py-3 font-semibold">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-16 md:py-20 overflow-hidden">
        {/* Subtle Brand Watermark */}
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none">
          <Image
            src="/brand/badge/sundayempire-logo-badge.png"
            alt=""
            width={400}
            height={400}
            className="opacity-[0.03] transform translate-x-32"
            aria-hidden="true"
          />
        </div>
        
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="flex flex-col justify-center">
              <h1 className="text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                Dynasty league operations
              </h1>
              <p className="mt-6 text-xl md:text-2xl leading-relaxed" style={{ color: "var(--foreground)" }}>
                Control center for contract leagues. Validate trades, manage caps, track picks.
              </p>
              <div className="mt-6">
                <p className="text-lg" style={{ color: "var(--muted-foreground)" }}>
                  Sign in to access your leagues, create new leagues, or join with an invite
                </p>
              </div>
            </div>
            
            {/* Product Preview Panel */}
            <div className="relative">
              <div 
                className="rounded-2xl p-6 shadow-lg border"
                style={{
                  backgroundColor: "var(--brand-surface-elevated)",
                  borderColor: "var(--brand-structure-muted)"
                }}
              >
                {/* Action Center Preview */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.2em] font-medium" style={{ color: "var(--muted-foreground)" }}>
                        Commissioner Operations
                      </p>
                      <h3 className="text-lg font-semibold">What needs attention now</h3>
                    </div>
                    <div 
                      className="rounded-full px-3 py-1 text-xs border font-medium"
                      style={{
                        backgroundColor: "var(--brand-accent-soft)",
                        borderColor: "var(--brand-accent-primary)",
                        color: "var(--brand-accent-primary)"
                      }}
                    >
                      3 Pending
                    </div>
                  </div>
                  
                  {/* Priority Action */}
                  <div 
                    className="rounded-lg p-4 border-2"
                    style={{
                      backgroundColor: "var(--status-warning-bg)",
                      borderColor: "var(--status-warning-border)"
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div 
                          className="inline-flex items-center rounded px-2 py-1 text-xs font-medium border"
                          style={{
                            backgroundColor: "var(--status-warning-bg)",
                            borderColor: "var(--status-warning-border)",
                            color: "var(--status-warning-text)"
                          }}
                        >
                          Commissioner Review
                        </div>
                        <h4 className="font-semibold text-sm">Hawks exceed soft cap in trade proposal</h4>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          $267 total cap hit over $245 limit • Due: 3h 42m
                        </p>
                      </div>
                      <div 
                        className="rounded px-3 py-1 text-xs font-medium border"
                        style={{
                          backgroundColor: "var(--brand-surface-card)",
                          borderColor: "var(--brand-structure-muted)",
                          color: "var(--foreground)"
                        }}
                      >
                        Review
                      </div>
                    </div>
                  </div>
                  
                  {/* Secondary Actions */}
                  <div className="space-y-3">
                    <div 
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{
                        backgroundColor: "var(--brand-surface-card)",
                        borderColor: "var(--brand-structure-muted)"
                      }}
                    >
                      <div className="space-y-1">
                        <h4 className="font-medium text-sm">Settlement queue</h4>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          2 approved trade proposals awaiting processing
                        </p>
                      </div>
                      <div 
                        className="rounded-full w-2 h-2"
                        style={{ backgroundColor: "var(--status-info-border)" }}
                      />
                    </div>
                    
                    <div 
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{
                        backgroundColor: "var(--brand-surface-card)",
                        borderColor: "var(--brand-structure-muted)"
                      }}
                    >
                      <div className="space-y-1">
                        <h4 className="font-medium text-sm">Pick ownership assignment</h4>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          2026 R2 (#18) ownership requires transfer
                        </p>
                      </div>
                      <div 
                        className="rounded-full w-2 h-2"
                        style={{ backgroundColor: "var(--status-neutral-border)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Value Proposition */}
      <section className="px-6 py-14" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Built for operational control</h2>
          <p className="mt-4 text-xl" style={{ color: "var(--foreground)" }}>
            Dynasty league management that prioritizes compliance, transparency, and commissioner confidence.
          </p>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-3">
            <div className="text-center group">
              <div className="mb-4">
                <div 
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-200"
                  style={{ 
                    borderColor: "var(--brand-structure-muted)",
                    backgroundColor: "var(--brand-surface-card)"
                  }}
                >
                  <div 
                    className="w-6 h-6 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: "var(--brand-accent-primary)" }}
                  />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">Know what matters next</h3>
              <p className="text-lg leading-relaxed" style={{ color: "var(--foreground)" }}>
                Dashboard intelligence highlights deadlines, blocked trades, and cap violations.
              </p>
            </div>
            
            <div className="text-center group">
              <div className="mb-4">
                <div 
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-200"
                  style={{ 
                    borderColor: "var(--brand-structure-muted)",
                    backgroundColor: "var(--brand-surface-card)"
                  }}
                >
                  <div 
                    className="w-6 h-6 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: "var(--brand-accent-primary)" }}
                  />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">Make legal moves with confidence</h3>
              <p className="text-lg leading-relaxed" style={{ color: "var(--foreground)" }}>
                Real-time validation for trades, contracts, and draft picks. No rule violations.
              </p>
            </div>
            
            <div className="text-center group">
              <div className="mb-4">
                <div 
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-200"
                  style={{ 
                    borderColor: "var(--brand-structure-muted)",
                    backgroundColor: "var(--brand-surface-card)"
                  }}
                >
                  <div 
                    className="w-6 h-6 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: "var(--brand-accent-primary)" }}
                  />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">Run transparent operations</h3>
              <p className="text-lg leading-relaxed" style={{ color: "var(--foreground)" }}>
                Commissioner tools with full audit logs. Every decision is tracked and visible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Transition */}
      <section className="px-6 py-12 relative">
        <div className="mx-auto max-w-7xl">
          {/* Gradient separator */}
          <div 
            className="h-px w-full mb-8" 
            style={{
              background: "linear-gradient(90deg, transparent, var(--brand-structure-muted) 25%, var(--brand-accent-primary) 50%, var(--brand-structure-muted) 75%, transparent)",
              opacity: "0.6"
            }}
          />
          {/* Call to action zone */}
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to streamline your dynasty operations?</h2>
            <p className="text-lg mb-6" style={{ color: "var(--muted-foreground)" }}>
              SundayEmpire is invite-only. Sign in if you have an account, or ask a member to invite you.
            </p>
            <Link href="/login">
              <Button variant="primary" size="lg" className="text-lg px-8 py-4 font-semibold">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-16 relative" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 items-center">
            {/* Brand Section */}
            <div className="flex flex-col items-start">
              <Image
                src="/brand/wordmark/sundayempire-logo-primary-wordmark.png"
                alt="SundayEmpire"
                width={160}
                height={43}
                className="mb-3"
              />
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                Dynasty league operations platform
              </p>
            </div>
            
            {/* Links Section */}
            <div className="flex flex-col space-y-3 md:items-center">
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Get Started
              </h3>
              <div className="flex flex-col space-y-2 text-sm">
                <Link 
                  href="/login" 
                  className="hover:underline transition-colors" 
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Sign in to your leagues
                </Link>
                <Link
                  href="/join"
                  className="hover:underline transition-colors"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Accept a platform invite
                </Link>
              </div>
            </div>
            
            {/* Copyright Section */}
            <div className="flex flex-col items-start lg:items-end">
              <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
                Built for commissioners
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                © 2026 SundayEmpire
              </p>
            </div>
          </div>
        </div>
        
        {/* Subtle brand watermark */}
        <div className="absolute bottom-0 right-0 pointer-events-none overflow-hidden">
          <Image
            src="/brand/badge/sundayempire-logo-badge.png"
            alt=""
            width={120}
            height={120}
            className="opacity-[0.02] transform translate-x-8 translate-y-8"
            aria-hidden="true"
          />
        </div>
      </footer>
    </div>
  );
}
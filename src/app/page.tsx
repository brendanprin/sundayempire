import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui";

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      {/* Header / Top Bar */}
      <header className="border-b px-6 py-4" style={{ borderColor: "var(--brand-structure-muted)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Image
            src="/brand/wordmark/sundayempire-logo-primary-wordmark.png"
            alt="SundayEmpire"
            width={180}
            height={48}
            priority
          />
          <Link href="/login">
            <Button variant="primary" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-28 overflow-hidden">
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
              <p className="mt-6 text-xl md:text-2xl" style={{ color: "var(--muted-foreground)" }}>
                Control center for contract leagues. Validate trades, manage caps, track picks.
              </p>
              <div className="mt-8 rounded-lg border p-5" style={{ backgroundColor: "var(--brand-surface-muted)", borderColor: "var(--brand-structure-muted)" }}>
                <p className="text-base font-medium" style={{ color: "var(--foreground)" }}>
                  ⚡ Ready to Use
                </p>
                <p className="mt-2 text-base" style={{ color: "var(--muted-foreground)" }}>
                  Sign in to access your leagues or create a new one. Join existing leagues with an invite.
                </p>
              </div>
              <div className="mt-10 flex gap-4">
                <Link href="/login">
                  <Button variant="primary" size="lg" className="text-lg px-8 py-4">
                    Sign in
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="secondary" size="lg" className="text-lg px-6 py-4">
                    I have an invite
                  </Button>
                </Link>
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
                {/* Mock Dashboard Cards */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Dynasty Control Center</h3>
                    <div 
                      className="rounded-full px-3 py-1 text-xs border"
                      style={{
                        backgroundColor: "var(--brand-accent-soft)",
                        borderColor: "var(--brand-accent-primary)",
                        color: "var(--brand-accent-primary)"
                      }}
                    >
                      Active League
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div 
                      className="rounded-lg p-3 border"
                      style={{
                        backgroundColor: "var(--brand-surface-card)",
                        borderColor: "var(--brand-structure-muted)"
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Cap Space</div>
                      <div className="text-lg font-semibold">$12.4M</div>
                    </div>
                    <div 
                      className="rounded-lg p-3 border"
                      style={{
                        backgroundColor: "var(--brand-surface-card)",
                        borderColor: "var(--brand-structure-muted)"
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Pending</div>
                      <div className="text-lg font-semibold">3 Trades</div>
                    </div>
                  </div>
                  
                  <div 
                    className="rounded-lg p-3 border"
                    style={{
                      backgroundColor: "var(--brand-surface-card)",
                      borderColor: "var(--brand-structure-muted)"
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Rookie Draft</span>
                      <span 
                        className="rounded px-2 py-1 text-xs border"
                        style={{
                          backgroundColor: "var(--status-info-bg)",
                          borderColor: "var(--status-info-border)",
                          color: "var(--status-info-text)"
                        }}
                      >
                        In Progress
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Access Paths */}
      <section className="px-6 py-20" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Choose your access path</h2>
            <p className="mt-4 text-lg" style={{ color: "var(--muted-foreground)" }}>
              Three ways to get started with dynasty league operations
            </p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            {/* Returning User */}
            <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: "var(--brand-surface-elevated)", borderColor: "var(--brand-structure-muted)" }}>
              <h3 className="text-xl font-semibold">Returning User</h3>
              <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>
                You already have league access and want to sign in to your dashboard.
              </p>
              <div className="mt-6">
                <Link href="/login">
                  <Button variant="primary" size="lg" className="w-full">
                    Sign in
                  </Button>
                </Link>
              </div>
            </div>
            
            {/* Have Invite */}
            <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: "var(--brand-surface-elevated)", borderColor: "var(--brand-structure-muted)" }}>
              <h3 className="text-xl font-semibold">Have an Invite</h3>
              <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>
                Commissioner sent you an invite link to join their league as team manager or member.
              </p>
              <div className="mt-6">
                <Link href="/login">
                  <Button variant="secondary" size="lg" className="w-full">
                    Join with invite
                  </Button>
                </Link>
              </div>
            </div>
            
            {/* Start League */}
            <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: "var(--brand-surface-elevated)", borderColor: "var(--brand-structure-muted)" }}>
              <h3 className="text-xl font-semibold">Start New League</h3>
              <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>
                Create your own league and become commissioner. Invite managers and set up teams.
              </p>
              <div className="mt-6">
                <Link href="/login">
                  <Button variant="primary" size="lg" className="w-full">
                    Create league
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          
          <div className="mt-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            All paths require account sign-in • No approval needed • Start using immediately
          </div>
        </div>
      </section>

      {/* Core Value Proposition */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-3">
            <div 
              className="rounded-xl p-8 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-xl font-semibold">Know what matters next</h3>
              <p className="mt-4 text-base" style={{ color: "var(--muted-foreground)" }}>
                Dashboard intelligence highlights deadlines, blocked trades, and cap violations.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-8 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-xl font-semibold">Make legal moves with confidence</h3>
              <p className="mt-4 text-base" style={{ color: "var(--muted-foreground)" }}>
                Real-time validation for trades, contracts, and draft picks. No rule violations.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-8 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-xl font-semibold">Run transparent operations</h3>
              <p className="mt-4 text-base" style={{ color: "var(--muted-foreground)" }}>
                Commissioner tools with full audit logs. Every decision is tracked and visible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t px-6 py-8" style={{ borderColor: "var(--brand-structure-muted)" }}>
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            © 2026 SundayEmpire. Dynasty league operations platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
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
      <section className="relative px-6 py-16 md:py-24 overflow-hidden">
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
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col justify-center">
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                Dynasty league operations, simplified
              </h1>
              <p className="mt-6 text-lg md:text-xl" style={{ color: "var(--muted-foreground)" }}>
                The control center for contract leagues. Manage caps, validate trades, track picks, and run commissioner operations with confidence.
              </p>
              <div className="mt-6 rounded-lg border p-4" style={{ backgroundColor: "var(--brand-surface-muted)", borderColor: "var(--brand-structure-muted)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  ⚡ MVP Access
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Currently invite-only. Connect with a league commissioner or existing member to receive access.
                </p>
              </div>
              <div className="mt-8">
                <Link href="/login">
                  <Button variant="primary" size="lg">
                    Sign in
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

      {/* Access Path Section */}
      <section className="px-6 py-16" style={{ backgroundColor: "var(--brand-surface-muted)" }}>
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold">How to get access</h2>
          <p className="mt-4 text-lg" style={{ color: "var(--muted-foreground)" }}>
            SundayEmpire is currently invite-only during MVP development
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--brand-surface-elevated)", borderColor: "var(--brand-structure-muted)" }}>
              <h3 className="font-semibold">Join an existing league</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Ask your league commissioner to send you an invitation through the platform. They can add you as a team manager or general member.
              </p>
            </div>
            <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--brand-surface-elevated)", borderColor: "var(--brand-structure-muted)" }}>
              <h3 className="font-semibold">Start a new league</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Connect with existing SundayEmpire users who can help you get commissioner access to create and manage a new league.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Value Strip - 3 Columns */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-3">
            <div 
              className="rounded-xl p-6 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-lg font-semibold">Know what matters next</h3>
              <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Dashboard intelligence that highlights deadlines, blocked trades, and cap violations.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-lg font-semibold">Make legal moves with confidence</h3>
              <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Real-time validation for trades, contracts, and draft picks. No more rule violations.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 text-center border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-lg font-semibold">Run the league transparently</h3>
              <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Commissioner tools with full audit logs. Every decision is tracked and visible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Built for Both Sides */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold">Built for both sides of the league</h2>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <div 
              className="rounded-xl p-8 border"
              style={{
                backgroundColor: "var(--brand-surface-elevated)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-xl font-semibold">For Managers</h3>
              <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                <li>• Submit legally compliant trades instantly</li>
                <li>• Monitor cap space and contract deadlines</li>
                <li>• Track rookie pick values and ownership</li>
                <li>• View transparent league activity timeline</li>
              </ul>
            </div>
            
            <div 
              className="rounded-xl p-8 border"
              style={{
                backgroundColor: "var(--brand-surface-elevated)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="text-xl font-semibold">For Commissioners</h3>
              <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                <li>• Review and approve trades with full context</li>
                <li>• Run draft sessions and manage pick trades</li>
                <li>• Enforce salary caps and contract compliance</li>
                <li>• Access comprehensive audit and reporting tools</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works - 4 Steps */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            <div className="text-center">
              <div 
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold border"
                style={{
                  backgroundColor: "var(--brand-accent-soft)",
                  borderColor: "var(--brand-accent-primary)",
                  color: "var(--brand-accent-primary)"
                }}
              >
                1
              </div>
              <h3 className="mt-4 font-semibold">Get invited</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Join through league invitations to access your workspace.
              </p>
            </div>
            
            <div className="text-center">
              <div 
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold border"
                style={{
                  backgroundColor: "var(--brand-accent-soft)",
                  borderColor: "var(--brand-accent-primary)",
                  color: "var(--brand-accent-primary)"
                }}
              >
                2
              </div>
              <h3 className="mt-4 font-semibold">See what needs attention</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Dashboard shows pending trades, deadlines, and priority actions.
              </p>
            </div>
            
            <div className="text-center">
              <div 
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold border"
                style={{
                  backgroundColor: "var(--brand-accent-soft)",
                  borderColor: "var(--brand-accent-primary)",
                  color: "var(--brand-accent-primary)"
                }}
              >
                3
              </div>
              <h3 className="mt-4 font-semibold">Take a legal action</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Submit trades, manage contracts, or make draft selections.
              </p>
            </div>
            
            <div className="text-center">
              <div 
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold border"
                style={{
                  backgroundColor: "var(--brand-accent-soft)",
                  borderColor: "var(--brand-accent-primary)",
                  color: "var(--brand-accent-primary)"
                }}
              >
                4
              </div>
              <h3 className="mt-4 font-semibold">Keep the league moving</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                All members see transparent activity, maintaining league trust.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid - 6 Cards */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold">Core features</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Dashboard</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Unified view of league status, pending actions, and priority deadlines.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Contracts & Cap</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Real-time salary cap tracking with contract validation and deadline alerts.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Trade Validation</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Instant rule compliance checking for all proposed trades and moves.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Rookie Picks & Draft</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Draft session management with pick tracking and trade support.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Commissioner Operations</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                League setup, ruleset management, and administrative oversight tools.
              </p>
            </div>
            
            <div 
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: "var(--brand-surface-card)",
                borderColor: "var(--brand-structure-muted)"
              }}
            >
              <h3 className="font-semibold">Activity & Audit</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Complete transaction history with transparent decision tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA Section */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/brand/badge/sundayempire-logo-badge.png"
              alt="SundayEmpire"
              width={48}
              height={48}
              className="opacity-80"
            />
          </div>
          <h2 className="text-3xl font-bold">Ready to streamline your dynasty league?</h2>
          <p className="mt-4 text-lg" style={{ color: "var(--muted-foreground)" }}>
            Join commissioners and managers who trust SundayEmpire for legal, transparent league operations.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button variant="primary" size="lg">
                Sign in
              </Button>
            </Link>
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
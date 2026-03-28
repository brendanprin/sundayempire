import { BrandWordmark } from "@/components/brand";

export default function AuthGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen px-4 py-8 md:px-6" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      <main className="mx-auto w-full max-w-2xl rounded-xl border border-[var(--brand-structure-muted)] p-4 md:p-6" style={{ backgroundColor: "var(--brand-surface-elevated)" }}>
        <div className="mb-6 flex justify-center">
          <BrandWordmark variant="primary" size="lg" />
        </div>
        {children}
      </main>
    </div>
  );
}

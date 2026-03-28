"use client";

import Link from "next/link";

export type SideNavLink = {
  href: string;
  label: string;
  active: boolean;
};

export type SideNavSection = {
  id: string;
  label: string;
  links: SideNavLink[];
};

export function SideNav(props: {
  sections: SideNavSection[];
  onLinkSelect?: (sectionId: string, link: SideNavLink) => void;
}) {
  return (
    <aside
      className="shell-panel shell-side-nav w-full px-3 py-4 xl:sticky xl:top-6 xl:w-72 xl:self-start"
      style={{
        backgroundColor: "var(--brand-surface-elevated)",
        borderColor: "var(--brand-structure-muted)",
      }}
      data-testid="shell-side-nav"
    >
      <nav className="space-y-4" aria-label="Primary navigation">
        {props.sections.map((section) => (
          <section key={section.id} data-testid={`primary-nav-section-${section.id}`}>
            <p 
              className="px-2 text-[11px] uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {section.label}
            </p>
            <div className="mt-2 space-y-1.5">
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.active ? "page" : undefined}
                  className="shell-nav-link text-sm"
                  onClick={() => props.onLinkSelect?.(section.id, link)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

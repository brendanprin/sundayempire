"use client";

type StickySubnavItem = {
  href: `#${string}`;
  label: string;
};

export function StickySubnav({
  items,
  testId,
}: {
  items: StickySubnavItem[];
  testId?: string;
}) {
  return (
    <nav
      className="sticky top-2 z-20 -mx-1 mb-4 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur"
      aria-label="Page section navigation"
      data-testid={testId}
    >
      <ul className="flex min-w-max items-center gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="inline-flex whitespace-nowrap rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

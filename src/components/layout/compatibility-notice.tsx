import Link from "next/link";

type CompatibilityNoticeTone = "warning" | "neutral";

type CompatibilityNoticeLink = {
  href: string;
  label: string;
};

function toneClasses(tone: CompatibilityNoticeTone) {
  if (tone === "neutral") {
    return "border-slate-700/80 bg-slate-950/60 text-slate-200";
  }

  return "border-amber-700/50 bg-amber-950/20 text-amber-100";
}

export function CompatibilityNotice(props: {
  eyebrow?: string;
  title: string;
  description: string;
  links?: CompatibilityNoticeLink[];
  tone?: CompatibilityNoticeTone;
  testId?: string;
}) {
  const tone = props.tone ?? "warning";

  return (
    <section
      className={`rounded-xl border px-4 py-3 ${toneClasses(tone)}`}
      data-testid={props.testId}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">
        {props.eyebrow ?? "Compatibility route"}
      </p>
      <h3 className="mt-2 text-sm font-semibold">{props.title}</h3>
      <p className="mt-2 text-sm opacity-90">{props.description}</p>
      {props.links && props.links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {props.links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

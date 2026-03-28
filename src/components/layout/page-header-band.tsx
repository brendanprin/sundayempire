import type { ReactNode } from "react";

export function PageHeaderBand(props: {
  eyebrow: string;
  title: string;
  description: string;
  headingLevel?: "h1" | "h2" | "h3";
  eyebrowTestId?: string;
  titleTestId?: string;
  className?: string;
  supportingContent?: ReactNode;
  aside?: ReactNode;
}) {
  const HeadingTag = props.headingLevel ?? "h1";
  const className = ["shell-panel", "shell-page-header", props.className].filter(Boolean).join(" ");

  return (
    <section 
      className={className}
      style={{
        backgroundColor: "var(--brand-surface-elevated)",
        borderColor: "var(--brand-structure-muted)",
      }}
    >
      <div className="shell-page-header__grid">
        <div className="min-w-0">
          <p className="shell-kicker" data-testid={props.eyebrowTestId}>
            {props.eyebrow}
          </p>
          <HeadingTag className="shell-page-header__title mt-3" data-testid={props.titleTestId}>
            {props.title}
          </HeadingTag>
          <p className="shell-page-header__description mt-3">{props.description}</p>
          {props.supportingContent ? <div className="mt-4">{props.supportingContent}</div> : null}
        </div>
        {props.aside ? <div>{props.aside}</div> : null}
      </div>
    </section>
  );
}

export function MirrorOnlyBanner(props: {
  message: string;
  detail?: string;
  testId?: string;
}) {
  return (
    <section className="shell-banner-warning-compact mt-2 px-3 py-1.5" data-testid={props.testId}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-200">{props.message}</p>
          {props.detail ? (
            <p className="mt-0.5 text-xs text-amber-200/75 leading-relaxed">{props.detail}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

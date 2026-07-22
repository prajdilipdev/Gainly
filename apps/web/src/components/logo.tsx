import { cn } from '@/lib/utils';

/**
 * Gainly brand mark: rounded tile with a rising spark-line arrow.
 * Uses the theme's primary color so it adapts to light/dark mode.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-7 w-7', className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M7 21.5 13 15l3.5 3.5L24 10"
        className="stroke-primary-foreground"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 10H24v4.5"
        className="stroke-primary-foreground"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="21.5" r="1.6" className="fill-gain" />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2 font-bold', className)}>
      <LogoMark className={markClassName} />
      <span className="tracking-tight">
        Gainly<span className="text-gain">.</span>
      </span>
    </span>
  );
}

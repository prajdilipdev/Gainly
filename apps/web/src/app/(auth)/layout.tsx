import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-8 animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <Logo className="text-3xl" markClassName="h-9 w-9" />
      </div>
      {/* Fade only — a scale/zoom transform here would move the Sign In
          button's hitbox during mount and could drop the first click. */}
      <div className="w-full max-w-md animate-in fade-in-0 duration-300">
        {children}
      </div>
      <p className="mt-8 max-w-md text-center text-xs text-muted-foreground">
        Gainly — track US (NYSE/NASDAQ) and Indian (NSE/BSE) equities with live
        prices, analytics, alerts, and smart imports.
      </p>
    </div>
  );
}

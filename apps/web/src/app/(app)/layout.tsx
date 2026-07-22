'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Briefcase,
  Eye,
  Import,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  BellRing,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { useTheme } from 'next-themes';
import { getAccessToken } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import {
  useMarkAllNotificationsRead,
  useNotifications,
} from '@/hooks/use-data';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/format';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolios', label: 'Portfolios', icon: Briefcase },
  { href: '/watchlists', label: 'Watchlists', icon: Eye },
  { href: '/alerts', label: 'Alerts', icon: BellRing },
  { href: '/import', label: 'Import', icon: Import },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    } else {
      setAuthorized(true);
    }
  }, [router]);

  useBrowserNotifications();

  // Painting the shell immediately (rather than `null`) avoids a blank flash
  // while the client-side token check resolves.
  if (!authorized) return <AppShellSkeleton />;

  return (
    // The Sheet root wraps both trigger and content so Radix can return focus
    // to the menu button when the drawer closes.
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="flex min-h-screen">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
          <SidebarContent pathname={pathname} />
        </aside>

        {/* Sidebar (mobile drawer) */}
        <SheetContent side="left" className="lg:hidden">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Links to the main sections of Gainly.
          </SheetDescription>
          <SidebarContent
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <div className="flex-1" />
          <NotificationsBell />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="hidden max-w-32 truncate sm:inline">
                  {user?.name ?? 'Account'}
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="truncate text-sm font-medium">{user?.name}</div>
                <div className="truncate text-xs font-normal text-muted-foreground">
                  {user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => logout.mutate()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 md:p-6">
          {/*
            Opacity-only fade on route change. A transform-based slide here
            would move each button's hitbox during the animation window,
            which can cause a real mousedown/mouseup pair to land on
            different coordinates and silently get dropped as a "drag"
            instead of a click — the root cause of buttons needing a
            second click right after navigating.
          */}
          <div key={pathname} className="animate-in fade-in-0 duration-200">
            {children}
          </div>
        </main>
      </div>
      </div>
    </Sheet>
  );
}

/**
 * Static stand-in rendered while the client-side auth check runs. Mirrors the
 * real shell's geometry so the transition into the app does not shift layout.
 */
function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-hidden="true">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Logo className="text-lg" markClassName="h-6 w-6" />
        </div>
        <div className="space-y-1 p-3">
          {NAV.map((item) => (
            <Skeleton key={item.href} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <div className="flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-24" />
        </header>
        <main className="flex-1 space-y-4 p-4 md:p-6">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Logo className="text-lg" markClassName="h-6 w-6" />
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-label="Toggle theme" />;
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

function NotificationsBell() {
  const { data: notifications } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = notifications?.filter((n) => !n.readAt) ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 animate-in zoom-in-50 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground duration-300">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {(notifications ?? []).length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No notifications yet
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {(notifications ?? []).slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={cn(
                  'border-b px-3 py-2 text-sm last:border-0',
                  !n.readAt && 'bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{n.title}</span>
                  {!n.readAt && <Badge variant="secondary">new</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatDate(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

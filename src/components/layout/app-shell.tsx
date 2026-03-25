"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useExpenseStore } from "@/stores/use-expense-store";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/control-semanal", label: "Control Semanal", icon: CalendarRange },
  { href: "/gestion-cuotas", label: "Gestión de Cuotas", icon: CreditCard },
] as const;

function NavLinks({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-5 shrink-0 opacity-80" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const init = useExpenseStore((s) => s._init);
  const cloudSyncError = useExpenseStore((s) => s.cloudSyncError);
  const retrySyncToCloud = useExpenseStore((s) => s.retrySyncToCloud);
  const clearCloudSyncError = useExpenseStore((s) => s.clearCloudSyncError);
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex min-h-svh w-full flex-col bg-background md:flex-row">
      {/* Escritorio: sidebar */}
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
        aria-label="Navegación principal"
      >
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            Control de gastos
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-h-svh flex-1 flex-col">
        {/* Móvil: barra superior + menú en sheet */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-border bg-background"
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(100%,20rem)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="border-b border-sidebar-border text-left">
                <SheetTitle className="text-sidebar-foreground">
                  Menú
                </SheetTitle>
              </SheetHeader>
              <div className="p-3">
                <NavLinks onNavigate={() => setMobileMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm font-semibold text-foreground">
            Control de gastos
          </span>
        </header>

        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
            {cloudSyncError ? (
              <div
                role="alert"
                className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <p className="font-medium">Sincronización con la nube</p>
                <p className="mt-1 opacity-90">{cloudSyncError}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-amber-800/30 bg-background"
                    disabled={retrying}
                    onClick={() => {
                      setRetrying(true);
                      void retrySyncToCloud().finally(() =>
                        setRetrying(false)
                      );
                    }}
                  >
                    {retrying ? "Subiendo…" : "Reintentar subir a Supabase"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-amber-900 dark:text-amber-200"
                    onClick={() => clearCloudSyncError()}
                  >
                    Cerrar aviso
                  </Button>
                </div>
              </div>
            ) : null}
            {children}
          </div>
        </main>

        {/* Móvil: navegación inferior */}
        <MobileBottomNav />
      </div>
    </div>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      aria-label="Accesos rápidos"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-1 pt-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[0.65rem] font-medium sm:text-xs",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="line-clamp-2 text-center leading-tight">
                {label === "Gestión de Cuotas" ? "Cuotas" : label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

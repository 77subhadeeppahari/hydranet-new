import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useLogout } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, CalendarCheck, ChevronDown, ChevronRight, CircleHelp, ContactRound, CreditCard, FileSignature, LayoutDashboard, LogOut, Menu, Network, PackageOpen, Search, Settings, ShieldCheck, Users, WalletCards, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

export const ERP_VERSION = '1.0.0';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/plans', label: 'Broadband plans', icon: Network },
  { href: '/customers', label: 'Customer accounts', icon: ContactRound },
  { href: '/team', label: 'Team directory', icon: Users },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/expenses', label: 'Expenses & approvals', icon: CreditCard },
  { href: '/settings/roles', label: 'Role permissions', icon: ShieldCheck },
  { href: '/hr/payroll', label: 'HR & payroll', icon: WalletCards },
];

const partnerDirectoryItems = [
  { href: '/partner-agreements/new', label: 'Create Partner Agreement', icon: FileSignature },
  { href: '/partner-agreements', label: 'Partner List', icon: Users },
];

export function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value ?? 0);
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return <span data-testid={`status-${label.toLowerCase().replaceAll('_', '-')}`} className={`status-pill status-${tone}`}>{label.replaceAll('_', ' ')}</span>;
}

export function SectionCard({ children, className = '', title, eyebrow, action }: { children: ReactNode; className?: string; title?: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border bg-card shadow-[var(--shadow-soft)] ${className}`}>
      {(title || eyebrow || action) && <div className="flex items-start justify-between gap-4 border-b border-card-border px-5 py-4">
        <div>
          {eyebrow && <div className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</div>}
          {title && <h2 className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-card-foreground">{title}</h2>}
        </div>
        {action}
      </div>}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon = PackageOpen, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div data-testid="empty-state" className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
    <div className="mb-4 rounded-2xl bg-secondary p-4 text-primary"><Icon size={25} strokeWidth={1.7} /></div>
    <h3 className="text-sm font-bold text-foreground">{title}</h3>
    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3 p-5" data-testid="loading-skeleton">{Array.from({ length: count }).map((_, index) => <div key={index} className="skeleton h-12 rounded-xl" />)}</div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div>
      <div className="mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</div>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-foreground sm:text-[34px]">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
    {action}
  </header>;
}

export function StatCard({ label, value, detail, icon: Icon, accent = 'blue', testId }: { label: string; value: string; detail: string; icon: LucideIcon; accent?: 'orange' | 'blue' | 'green' | 'slate'; testId: string }) {
  return <div data-testid={testId} className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-5 shadow-[var(--shadow-soft)] transition-transform duration-200 hover:-translate-y-0.5">
    <div className={`absolute right-0 top-0 h-full w-1 ${accent === 'orange' ? 'bg-accent' : accent === 'green' ? 'bg-emerald-500' : accent === 'slate' ? 'bg-slate-400' : 'bg-primary'}`} />
    <div className="flex items-center justify-between">
      <div className="mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <Icon size={16} className={accent === 'orange' ? 'text-accent' : accent === 'green' ? 'text-emerald-600' : 'text-primary'} />
    </div>
    <div className="mt-4 text-[30px] font-bold tracking-[-0.05em] text-foreground">{value}</div>
    <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
  </div>;
}

function Sidebar({ user, onClose }: { user: User; onClose: () => void }) {
  const [location] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [partnerOpen, setPartnerOpen] = useState(location.startsWith('/partner-agreements'));
  return <aside className="fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-sidebar text-sidebar-foreground shadow-2xl shadow-slate-950/10 lg:static lg:shadow-none" data-testid="sidebar">
    <div className="flex h-[86px] items-center justify-between border-b border-sidebar-border px-6">
      <Link href="/" onClick={onClose} className="flex items-center gap-3" data-testid="link-brand">
        <img src="/assets/hydranet-logo.png" alt="Hydranet Broadband" className="h-12 w-auto object-contain object-left" />
      </Link>
      <button onClick={onClose} className="rounded-lg p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" data-testid="button-close-sidebar" aria-label="Close navigation"><X size={18} /></button>
    </div>
    <div className="px-4 pt-7">
      <div className="mono px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/45">Operations cockpit</div>
      <nav className="mt-3 space-y-1" aria-label="Primary navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? location === href : href.endsWith('/new') ? location === href : location === href;
          return <Link key={href} href={href} onClick={onClose} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-orange-950/15' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span>{label}</span>{active && <ChevronRight size={14} className="ml-auto" />}
          </Link>;
        })}
        <div className="pt-4">
          <button type="button" onClick={() => setPartnerOpen((open) => !open)} aria-expanded={partnerOpen} data-testid="button-nav-partner" className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${location.startsWith('/partner-agreements') ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
            <FileSignature size={17} />
            <span>Partner</span>
            <ChevronDown size={15} className={`ml-auto transition-transform ${partnerOpen ? 'rotate-180' : ''}`} />
          </button>
          {partnerOpen && <div className="mt-2 ml-3 space-y-1 border-l border-sidebar-border pl-2">
             {partnerDirectoryItems.filter(({ href }) => user.role !== 'STAFF' || href === '/partner-agreements').map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return <Link key={href} href={href} onClick={onClose} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-orange-950/15' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} /><span>{label}</span>{active && <ChevronRight size={14} className="ml-auto" />}
              </Link>;
            })}
          </div>}
        </div>
      </nav>
      <div className="mono mt-8 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/45">Workspace</div>
      <Link href="/settings" onClick={onClose} data-testid="link-nav-settings" className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${location.startsWith('/settings') ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}><Settings size={17} /><span>Portal settings</span></Link>
    </div>
    <div className="mt-auto p-4">
      <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-xs font-bold text-accent-foreground">{initials(user.name)}</div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{user.name}</div><div className="mt-0.5 truncate text-[11px] text-sidebar-foreground/55">{user.role} · {user.department}</div></div>
        </div>
        <button data-testid="button-logout" disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => { queryClient.clear(); window.location.assign(import.meta.env.BASE_URL); }, onError: (error) => window.alert(error instanceof Error ? error.message : 'The session could not be ended. Please try again.') })} className="mt-4 flex w-full items-center gap-2 rounded-lg px-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-60"><LogOut size={14} /> {logout.isPending ? 'Signing out…' : 'Sign out'}</button>
      </div>
      <div className="mt-4 space-y-2 px-2 text-[10px] text-sidebar-foreground/45">
        <div className="flex items-center gap-2"><ShieldCheck size={13} /> Internal access · encrypted session</div>
        <div className="mono flex items-center gap-2" data-testid="text-erp-version"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> ERP Version {ERP_VERSION}</div>
      </div>
    </div>
  </aside>;
}

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const pageName = location === '/'
    ? 'Overview'
    : navItems.find((item) => location.startsWith(item.href))?.label
      ?? partnerDirectoryItems.find((item) => location === item.href)?.label
      ?? 'Portal settings';
  return <div className="min-h-[100dvh] bg-background">
    <div className="flex min-h-[100dvh]">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden" onClick={() => setMobileOpen(false)} data-testid="button-overlay" aria-label="Close navigation overlay" />}
      <div className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:block lg:translate-x-0`}><Sidebar user={user} onClose={() => setMobileOpen(false)} /></div>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-[86px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-border bg-card p-2 lg:hidden" data-testid="button-open-sidebar" aria-label="Open navigation"><Menu size={19} /></button><div><div className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Hydranet / {pageName}</div><div className="mt-1 text-sm font-semibold text-foreground">Regional network operations</div></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground md:flex" data-testid="status-network"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Network nominal <ArrowUpRight size={13} /></div><Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground" data-testid="link-header-profile">{initials(user.name)}</Link></div>
        </div>
        <div className="app-grid min-h-[calc(100dvh-86px)] px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1440px] animate-enter">{children}</div></div>
      </main>
    </div>
  </div>;
}

export function SearchField({ value, onChange, placeholder, testId = 'input-search' }: { value: string; onChange: (value: string) => void; placeholder: string; testId?: string }) {
  return <div className="relative w-full sm:max-w-xs"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" /></div>;
}

export function ErrorNotice({ message = 'The service did not return this view.' }: { message?: string }) {
  return <div data-testid="error-notice" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"><div className="flex items-center gap-2 font-bold"><CircleHelp size={16} /> Unable to load live data</div><p className="mt-2 text-xs text-red-700/80">{message} Refresh or try again shortly.</p></div>;
}
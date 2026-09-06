import { Link } from 'wouter';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="app-grid flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-3xl border border-card-border bg-card p-8 shadow-[var(--shadow-soft)] sm:p-10" data-testid="error-not-found">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Compass size={25} /></div>
        <div className="mono mt-8 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Signal lost · 404</div>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.06em]">That route is off the map.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">The page you requested is not part of the Hydranet operations cockpit. Return to the overview and pick another signal.</p>
        <Link href="/" data-testid="link-return-overview" className="mt-8 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:brightness-110"><ArrowLeft size={15} /> Return to overview</Link>
      </div>
    </div>
  );
}

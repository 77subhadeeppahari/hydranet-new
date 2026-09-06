import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeIndianRupee, CalendarCheck, CalendarDays, Calculator, Check, CheckCircle2, Clock3, Download, Eye, EyeOff, FileSpreadsheet, FileText, Gauge, IndianRupee, LockKeyhole, Mail, MapPin, Network, Pencil, Plus, Receipt, RefreshCw, Send, Server, ShieldCheck, Trash2, UserPlus, UsersRound, WalletCards, X
} from 'lucide-react';
import {
  ExpenseCategory, ExpenseDecisionInputDecision, ExpenseInputPaymentMode, PlanBillingCycle, PlanStatus, Role, UserStatus,
  getGetCurrentUserQueryKey, getGetDashboardActivityQueryKey, getGetMyAttendanceQueryKey, getGetPayrollQueryKey, getGetPlanQueryKey, getListAttendanceQueryKey, getListExpensesQueryKey, getListMonthlyAttendanceQueryKey, getListPlansQueryKey, getListRolePermissionsQueryKey, getListSalaryStructuresQueryKey, getListUsersQueryKey,
  getGetSmtpSettingsQueryKey, useArchivePlan, useCreateExpense, useCreatePlan, useCreateUser, useDecideExpense, useDeleteUser, useGeneratePayroll, useGetDashboardActivity, useGetDashboardSummary, useGetMyAttendance, useGetPayroll, useGetPlan, useGetSmtpSettings, useListAttendance, useListExpenses, useListMonthlyAttendance, useListPlans, useListRolePermissions, useListSalaryStructures, useListUsers, usePunchAttendance, useRequestStorageUploadUrl, useTestSmtpSettings, useUpdatePlan, useUpdateRolePermissions, useUpdateSalaryStructure, useUpdateSmtpSettings, useUpdateUser, useUpdateUserProfilePhoto, useLogin
} from '@workspace/api-client-react';
import type { Expense, MonthlyAttendanceReport, Payslip, Plan, RolePermission, SalaryStructure, User } from '@workspace/api-client-react';
import {
  AppShell, EmptyState, ErrorNotice, formatCurrency, formatDate, formatTime, PageHeader, SearchField, SectionCard, SkeletonRows, StatCard, StatusPill, initials
} from '@/components/admin-shell';

const planDurationLabels: Record<PlanBillingCycle, string> = {
  ONE_MONTH: '1 Month',
  SIX_MONTHS: '6 Months',
  TWELVE_MONTHS: '12 Months',
};

function toneForStatus(value: string) {
  if (['ACTIVE', 'PRESENT', 'APPROVED'].includes(value)) return 'success' as const;
  if (['LATE', 'HALF_DAY', 'PENDING'].includes(value)) return 'warning' as const;
  if (['SUSPENDED', 'ABSENT', 'REJECTED', 'ARCHIVED'].includes(value)) return 'danger' as const;
  return 'neutral' as const;
}

function mapLocationHref(latitude: number | null | undefined, longitude: number | null | undefined) {
  return latitude == null || longitude == null ? null : `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function AttendanceLocation({ latitude, longitude, accuracyMeters }: { latitude?: number | null; longitude?: number | null; accuracyMeters?: number | null }) {
  const href = mapLocationHref(latitude, longitude);
  if (!href) return <span className="text-muted-foreground">—</span>;
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title={accuracyMeters == null ? undefined : `Accuracy ±${Math.round(accuracyMeters)}m`}><MapPin size={13} /> Map</a>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" data-testid="modal-backdrop">
    <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-card-border bg-card p-6 shadow-2xl sm:rounded-3xl">
      <div className="mb-5 flex items-start justify-between"><h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2><button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-secondary" data-testid="button-close-modal" aria-label="Close dialog"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

export function Button({ children, onClick, variant = 'primary', type = 'button', testId, disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; type?: 'button' | 'submit'; testId: string; disabled?: boolean }) {
  const styles = { primary: 'bg-primary text-primary-foreground hover:brightness-110', secondary: 'border border-border bg-card text-foreground hover:bg-secondary', quiet: 'text-muted-foreground hover:bg-secondary hover:text-foreground', danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100' };
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}>{children}</button>;
}

async function downloadReport(url: string, fallbackFilename: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('The report could not be generated.');
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition');
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function Field({ label, value, onChange, type = 'text', placeholder, required = false, autoComplete, minLength, disabled = false, testId }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; autoComplete?: string; minLength?: number; disabled?: boolean; testId?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-foreground">{label}{required && <span className="ml-1 text-accent">*</span>}</span><input data-testid={testId} disabled={disabled} autoComplete={autoComplete} required={required} minLength={minLength} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground" /></label>;
}

export function SelectField({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (value: string) => void; options: { label: string; value: string }[]; testId?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-foreground">{label}</span><select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function SignInPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { identifier, password } }, { onSuccess: (session) => { queryClient.setQueryData(getGetCurrentUserQueryKey(), session.user); setLocation('/'); } });
  };
  return <div className="flex min-h-[100dvh] bg-sidebar">
    <div className="hidden w-[44%] flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      <img src="/assets/hydranet-logo.png" alt="Hydranet Broadband" className="w-[250px] object-contain object-left brightness-0 invert" />
      <div className="max-w-md"><div className="mono text-[10px] font-bold uppercase tracking-[0.22em] text-accent">Private operations network</div><h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-[-0.06em]">Keep the<br /><span className="text-accent">signal moving.</span></h1><p className="mt-6 max-w-sm text-sm leading-6 text-primary-foreground/70">One cockpit for the people, plans and approvals that keep every Hydranet connection dependable.</p></div>
      <div className="flex items-center gap-2 text-xs text-primary-foreground/50"><ShieldCheck size={15} /> Authorized Hydranet personnel only</div>
    </div>
    <div className="flex flex-1 items-center justify-center bg-background p-6 sm:p-10">
      <form onSubmit={submit} className="w-full max-w-[410px] animate-enter" data-testid="form-login">
        <div className="mb-10 lg:hidden"><img src="/assets/hydranet-logo.png" alt="Hydranet Broadband" className="w-[210px] object-contain object-left" /></div>
        <div className="mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Staff sign-in</div>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.05em]">Welcome back.</h2><p className="mt-2 text-sm text-muted-foreground">Sign in to access the operations cockpit.</p>
        <div className="mt-8 space-y-5"><Field label="Email ID or mobile number" value={identifier} onChange={setIdentifier} type="text" autoComplete="username" placeholder="name@hydranet.in or 9876543210" required /><Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" placeholder="Minimum 8 characters" required /></div>
        {login.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="error-login">The credentials could not be verified. Please try again.</div>}
        <Button type="submit" testId="button-submit-login" disabled={login.isPending}>{login.isPending ? 'Verifying access…' : <><LockKeyhole size={15} /> Enter cockpit</>}</Button>
        <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck size={14} className="text-emerald-600" /> Session protected with Hydranet access controls</div>
      </form>
    </div>
  </div>;
}

export function DashboardPage({ user }: { user: User }) {
  const summaryQuery = useGetDashboardSummary();
  const activityQuery = useGetDashboardActivity();
  const summary = summaryQuery.data;
  const activity = activityQuery.data ?? [];
  const planMix = summary?.planMix ?? [];
  const spendTrend = summary?.spendTrend ?? [];
  const maxSpend = Math.max(...spendTrend.map((item) => item.value), 1);
  return <AppShell user={user}>
    <PageHeader eyebrow={`Good morning, ${user.name.split(' ')[0]}`} title="Operations overview" description="Your daily read on people, plans, spend and network readiness." action={<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><Clock3 size={14} className="text-accent" /> Updated just now</div>} />
    {summaryQuery.isError ? <ErrorNotice message="Dashboard summary is temporarily unavailable." /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard testId="stat-active-plans" label="Active plans" value={String(summary?.activePlans ?? '—')} detail="Published across the network" icon={Network} accent="blue" />
      <StatCard testId="stat-team-members" label="Team members" value={String(summary?.teamMembers ?? '—')} detail="People with active access" icon={UsersRound} accent="orange" />
      <StatCard testId="stat-attendance-rate" label="Attendance rate" value={summary ? `${summary.attendanceRate}%` : '—'} detail="Rolling 30-day average" icon={CalendarCheck} accent="green" />
      <StatCard testId="stat-pending-expenses" label="Pending approvals" value={String(summary?.pendingExpenses ?? '—')} detail={summary ? `${formatCurrency(summary.monthlySpend)} spend this month` : 'Awaiting live data'} icon={Receipt} accent="slate" />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
      <SectionCard title="Spend pulse" eyebrow="Financial signal" action={<span className="mono text-[10px] text-muted-foreground">LAST 6 MONTHS</span>}>
        <div className="p-5"><div className="flex items-end justify-between gap-3"><div><div className="text-3xl font-bold tracking-[-0.05em]">{formatCurrency(summary?.monthlySpend)}</div><div className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><ArrowDownRight size={14} /> 8.4% below last month</div></div><div className="rounded-xl bg-secondary p-3 text-primary"><BadgeIndianRupee size={20} /></div></div>
          <div className="mt-8 flex h-40 items-end gap-2 sm:gap-4">{(spendTrend.length ? spendTrend : [{ label: '—', value: 0 }]).map((item, index) => <div key={item.label + index} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="relative flex h-32 w-full items-end"><div data-testid={`bar-spend-${index}`} className={`w-full rounded-t-lg ${index === spendTrend.length - 1 ? 'bg-accent' : 'bg-primary/15'}`} style={{ height: `${Math.max((item.value / maxSpend) * 100, 8)}%` }} /></div><span className="mono text-[9px] text-muted-foreground">{item.label}</span></div>)}</div>
        </div>
      </SectionCard>
      <SectionCard title="Plan mix" eyebrow="Commercial snapshot">
        <div className="p-5">{planMix.length === 0 ? <EmptyState title="No plan mix yet" description="Once plans have subscribers, this view will show the portfolio shape." /> : <div className="space-y-5">{planMix.map((item, index) => <div key={item.label} data-testid={`row-plan-mix-${index}`}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold">{item.label}</span><span className="mono text-muted-foreground">{item.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${index % 2 === 0 ? 'bg-primary' : 'bg-accent'}`} style={{ width: `${item.value}%` }} /></div></div>)}</div>}</div>
      </SectionCard>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <SectionCard title="Recent activity" eyebrow="Audit trail" action={<Link href="/settings" data-testid="link-view-audit" className="text-xs font-bold text-primary hover:text-accent">View controls</Link>}>
        {activityQuery.isLoading ? <SkeletonRows count={4} /> : activity.length === 0 ? <EmptyState icon={Activity} title="The trail is clear" description="Admin actions will appear here as the team works." /> : <div className="divide-y divide-border">{activity.slice(0, 5).map((item) => <div key={item.id} data-testid={`row-activity-${item.id}`} className="flex gap-3 px-5 py-4"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] font-bold text-primary">{initials(item.actor)}</div><div className="min-w-0 flex-1 text-xs"><div><span className="font-bold">{item.actor}</span> <span className="text-muted-foreground">{item.action}</span> <span className="font-semibold text-foreground">{item.target}</span></div>{item.reportType && item.reportFormat && item.filterContext && <div className="mt-1 text-[11px] text-muted-foreground">{item.reportType} filters · {item.filterContext}</div>}<div className="mt-1 text-[11px] text-muted-foreground">{formatDate(item.timestamp)} · {formatTime(item.timestamp)}</div></div></div>)}</div>}
      </SectionCard>
      <SectionCard title="Network posture" eyebrow="Live status"><div className="p-5"><div className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground"><div className="rounded-xl bg-primary-foreground/10 p-3"><Gauge size={25} /></div><div><div className="mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground/60">Health score</div><div className="mt-1 text-3xl font-bold">{summary?.networkHealth ?? '—'}<span className="text-sm font-medium text-primary-foreground/60"> / 100</span></div></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-border p-3"><div className="text-[11px] text-muted-foreground">Core uptime</div><div className="mt-1 font-bold text-emerald-700">Operational</div></div><div className="rounded-xl border border-border p-3"><div className="text-[11px] text-muted-foreground">Open incidents</div><div className="mt-1 font-bold">0 active</div></div></div></div></SectionCard>
    </div></>}
  </AppShell>;
}

export function PlansPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const query = useListPlans();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const archive = useArchivePlan();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | Plan | null>(null);
  const selectedPlanId = modal && modal !== 'create' ? modal.id : 0;
  const selectedPlanQuery = useGetPlan(selectedPlanId, { query: { enabled: selectedPlanId > 0, queryKey: getGetPlanQueryKey(selectedPlanId) } });
  const [form, setForm] = useState<{ name: string; downloadMbps: string; uploadMbps: string; price: string; billingCycle: PlanBillingCycle; ottBenefits: string }>({ name: '', downloadMbps: '100', uploadMbps: '50', price: '799', billingCycle: PlanBillingCycle.ONE_MONTH, ottBenefits: '' });
  const plans = useMemo(() => (query.data ?? []).filter((plan) => `${plan.name} ${plan.downloadMbps}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  const openCreate = () => { setForm({ name: '', downloadMbps: '100', uploadMbps: '50', price: '799', billingCycle: PlanBillingCycle.ONE_MONTH, ottBenefits: '' }); setModal('create'); };
  const openEdit = (plan: Plan) => { setForm({ name: plan.name, downloadMbps: String(plan.downloadMbps), uploadMbps: String(plan.uploadMbps), price: String(plan.price), billingCycle: plan.billingCycle, ottBenefits: plan.ottBenefits.join(', ') }); setModal(plan); };
  const submit = (event: FormEvent) => { event.preventDefault(); const data = { name: form.name, downloadMbps: Number(form.downloadMbps), uploadMbps: Number(form.uploadMbps), price: Number(form.price), billingCycle: form.billingCycle, ottBenefits: form.ottBenefits.split(',').map((item) => item.trim()).filter(Boolean) }; if (modal === 'create') create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() }); setModal(null); } }); else if (modal) update.mutate({ id: modal.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() }); setModal(null); } }); };
  return <AppShell user={user}><PageHeader eyebrow="Commercial catalogue" title="Broadband plans" description="Shape the plans your region sells, from entry speeds to high-capacity links." action={user.role !== Role.STAFF ? <Button onClick={openCreate} testId="button-create-plan"><Plus size={15} /> New plan</Button> : undefined} />
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {plans.filter((p) => p.status === PlanStatus.ACTIVE).length} active · {plans.filter((p) => p.status === PlanStatus.ARCHIVED).length} archived</div><SearchField value={search} onChange={setSearch} placeholder="Search plans or speed…" testId="input-search-plans" /></div>
    <SectionCard>{query.isLoading ? <SkeletonRows /> : query.isError ? <div className="p-5"><ErrorNotice /></div> : plans.length === 0 ? <EmptyState icon={Network} title="No plans match that search" description="Try another plan name or create a new commercial plan." action={user.role !== Role.STAFF ? <Button onClick={openCreate} testId="button-empty-create-plan"><Plus size={15} /> Create plan</Button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Throughput</th><th className="px-5 py-4">Price</th><th className="px-5 py-4">Benefits</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{plans.map((plan) => <tr key={plan.id} data-testid={`row-plan-${plan.id}`} className="group hover:bg-secondary/25"><td className="px-5 py-4"><div className="font-bold">{plan.name}</div><div className="mono mt-1 text-[10px] text-muted-foreground">PLN-{String(plan.id).padStart(4, '0')}</div></td><td className="px-5 py-4"><div className="font-semibold">{plan.downloadMbps} <span className="text-xs font-normal text-muted-foreground">Mbps down</span></div><div className="mt-1 text-xs text-muted-foreground">{plan.uploadMbps} Mbps up</div></td><td className="px-5 py-4"><div className="font-bold">{formatCurrency(plan.price)}</div><div className="text-xs text-muted-foreground">/{planDurationLabels[plan.billingCycle]}</div></td><td className="max-w-[200px] px-5 py-4"><div className="flex flex-wrap gap-1">{plan.ottBenefits.length ? plan.ottBenefits.map((benefit) => <span key={benefit} className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium">{benefit}</span>) : <span className="text-xs text-muted-foreground">No OTT benefits</span>}</div></td><td className="px-5 py-4"><StatusPill label={plan.status} tone={toneForStatus(plan.status)} /></td><td className="px-5 py-4 text-right">{user.role !== Role.STAFF && <div className="flex justify-end gap-1 opacity-80"><button onClick={() => openEdit(plan)} data-testid={`button-edit-plan-${plan.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary" aria-label={`Edit ${plan.name}`}><Pencil size={15} /></button>{plan.status === PlanStatus.ACTIVE && <button onClick={() => { if (window.confirm(`Archive ${plan.name}?`)) archive.mutate({ id: plan.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() }) }); }} data-testid={`button-archive-plan-${plan.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label={`Archive ${plan.name}`}><Trash2 size={15} /></button>}</div>}</td></tr>)}</tbody></table></div>}</SectionCard>
    <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Create a broadband plan' : selectedPlanQuery.isFetching ? 'Edit broadband plan · loading…' : 'Edit broadband plan'}><form onSubmit={submit} className="space-y-4"><Field label="Plan name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Home 200" required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Download Mbps" value={form.downloadMbps} onChange={(value) => setForm({ ...form, downloadMbps: value })} type="number" required /><Field label="Upload Mbps" value={form.uploadMbps} onChange={(value) => setForm({ ...form, uploadMbps: value })} type="number" required /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Price (INR)" value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" required /><SelectField label="Billing duration" value={form.billingCycle} onChange={(value) => setForm({ ...form, billingCycle: value as typeof form.billingCycle })} options={[{ label: '1 Month', value: PlanBillingCycle.ONE_MONTH }, { label: '6 Months', value: PlanBillingCycle.SIX_MONTHS }, { label: '12 Months', value: PlanBillingCycle.TWELVE_MONTHS }]} /></div><Field label="OTT benefits" value={form.ottBenefits} onChange={(value) => setForm({ ...form, ottBenefits: value })} placeholder="Netflix, Prime Video, Cloud storage" /><div className="flex justify-end gap-2 pt-3"><Button variant="secondary" onClick={() => setModal(null)} testId="button-cancel-plan">Cancel</Button><Button type="submit" testId="button-save-plan" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Saving…' : 'Save plan'}</Button></div></form></Modal>
  </AppShell>;
}

export function TeamPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const query = useListUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const upload = useRequestStorageUploadUrl();
  const updatePhoto = useUpdateUserProfilePhoto();
  const remove = useDeleteUser();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | User | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; phone: string; password: string; role: Role; department: string; isPublic: boolean }>({ name: '', email: '', phone: '', password: '', role: Role.STAFF, department: 'Operations', isPublic: false });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const users = useMemo(() => (query.data ?? []).filter((member) => `${member.name} ${member.email} ${member.department}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  useEffect(() => () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  const resetPhotoState = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setClearPhoto(false);
    setPhotoError('');
  };
  const closeModal = () => { setModal(null); resetPhotoState(); };
  const openCreate = () => {
    setForm({ name: '', email: '', phone: '', password: '', role: Role.STAFF, department: 'Operations', isPublic: false });
    resetPhotoState();
    setModal('create');
  };
  const openEdit = (member: User) => {
    setForm({ name: member.name, email: member.email, phone: member.phone, password: '', role: member.role, department: member.department, isPublic: member.isPublic });
    setSelectedPhoto(null);
    setPhotoPreview(member.profilePhotoPath ? `/api/storage${member.profilePhotoPath}` : null);
    setClearPhoto(false);
    setPhotoError('');
    setModal(member);
  };
  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Profile photos must be 5 MB or smaller.');
      return;
    }
    setPhotoError('');
    setSelectedPhoto(file);
    setClearPhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
  };
  const uploadPhoto = async (file: File) => {
    const uploadDetails = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
    const response = await fetch(uploadDetails.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new Error('The profile photo upload could not be completed.');
    return uploadDetails.objectPath;
  };
  const toggleVisibility = (member: User) => {
    update.mutate({ id: member.id, data: { isPublic: !member.isPublic } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      onError: (error) => window.alert(error instanceof Error ? error.message : 'The public visibility could not be updated.'),
    });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (photoError) return;
    try {
      const objectPath = selectedPhoto ? await uploadPhoto(selectedPhoto) : clearPhoto ? null : undefined;
      if (modal === 'create') {
        const created = await create.mutateAsync({
          data: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            password: form.password,
            role: form.role,
            department: form.department.trim(),
          },
        });
        if (objectPath !== undefined) await updatePhoto.mutateAsync({ id: created.id, data: { objectPath } });
      } else if (modal) {
        await update.mutateAsync({ id: modal.id, data: { name: form.name.trim(), phone: form.phone.trim(), role: form.role, department: form.department.trim(), isPublic: form.isPublic } });
        if (objectPath !== undefined) await updatePhoto.mutateAsync({ id: modal.id, data: { objectPath } });
      }
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      closeModal();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The team member could not be saved.');
    }
  };
  return <AppShell user={user}><PageHeader eyebrow="People & access" title="Team directory" description="The people behind the network, with access and role context always close at hand." action={user.role !== Role.STAFF ? <Button onClick={openCreate} testId="button-create-user"><UserPlus size={15} /> Add member</Button> : undefined} />
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex gap-2 text-xs text-muted-foreground"><span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700">{users.filter((member) => member.status === UserStatus.ACTIVE).length} active</span><span className="rounded-lg bg-secondary px-2.5 py-1.5">{users.length} shown</span></div><SearchField value={search} onChange={setSearch} placeholder="Search people, teams…" testId="input-search-team" /></div>
       <SectionCard>{query.isLoading ? <SkeletonRows /> : query.isError ? <div className="p-5"><ErrorNotice /></div> : users.length === 0 ? <EmptyState icon={UsersRound} title="No one found" description="Try a different name, email or department." /> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Person</th><th className="px-5 py-4">Department</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Public directory</th><th className="px-5 py-4">Joined</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{users.map((member) => <tr key={member.id} data-testid={`row-user-${member.id}`} className="hover:bg-secondary/25"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-xs font-bold text-primary">{member.profilePhotoPath ? <img src={`/api/storage${member.profilePhotoPath}`} alt="" className="h-full w-full object-cover" /> : initials(member.name)}</div><div><div className="font-bold">{member.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{member.email} · {member.phone}</div></div></div></td><td className="px-5 py-4 text-sm">{member.department}</td><td className="px-5 py-4"><span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold">{member.role}</span></td><td className="px-5 py-4"><StatusPill label={member.status} tone={toneForStatus(member.status)} /></td><td className="px-5 py-4"><button disabled={user.role === Role.STAFF || update.isPending} onClick={() => toggleVisibility(member)} data-testid={`button-toggle-public-user-${member.id}`} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${member.isPublic ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`} aria-label={`${member.isPublic ? 'Hide' : 'Show'} ${member.name} on public directory`}>{member.isPublic ? <Eye size={13} /> : <EyeOff size={13} />}{member.isPublic ? 'Visible' : 'Hidden'}</button></td><td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(member.createdAt)}</td><td className="px-5 py-4 text-right">{user.role !== Role.STAFF && <div className="flex justify-end gap-1"><button onClick={() => openEdit(member)} data-testid={`button-edit-user-${member.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary" aria-label={`Edit ${member.name}`}><Pencil size={15} /></button><button onClick={() => { if (window.confirm(`Delete ${member.name}? Members with historical attendance, payroll, expense, or audit records cannot be permanently deleted.`)) remove.mutate({ id: member.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }), onError: (error) => window.alert(error instanceof Error ? error.message : 'The team member could not be deleted.') }); }} data-testid={`button-delete-user-${member.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${member.name}`}><Trash2 size={15} /></button></div>}</td></tr>)}</tbody></table></div>}</SectionCard>
       <Modal open={modal !== null} onClose={closeModal} title={modal === 'create' ? 'Add a team member' : 'Edit team member'}><form onSubmit={submit} className="space-y-4"><Field label="Full name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} minLength={2} required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Email ID" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" required /><Field label="Mobile number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} type="tel" required /></div>{modal === 'create' && <Field label="Temporary password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" minLength={8} required />}<div className="grid gap-4 sm:grid-cols-2"><SelectField label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value as typeof form.role })} options={[{ label: 'Staff', value: Role.STAFF }, { label: 'Admin', value: Role.ADMIN }, { label: 'Superadmin', value: Role.SUPERADMIN }]} /><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} required /></div><div className="rounded-xl border border-border bg-secondary/35 p-3"><div className="flex items-center gap-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-lg font-bold text-primary">{photoPreview ? <img src={photoPreview} alt="Profile preview" className="h-full w-full object-cover" /> : initials(form.name || 'Team member')}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">Team member profile photo</div><p className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB. Public members can use this photo on the About page.</p><div className="mt-3 flex flex-wrap items-center gap-2"><label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:brightness-110"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choosePhoto(event.target.files?.[0])} data-testid="input-team-profile-photo" />{photoPreview ? 'Replace photo' : 'Choose photo'}</label>{photoPreview && <button type="button" onClick={() => { setSelectedPhoto(null); setPhotoPreview(null); setClearPhoto(true); setPhotoError(''); }} className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-bold hover:bg-secondary" data-testid="button-remove-team-profile-photo">Remove photo</button>}</div>{photoError && <p className="mt-2 text-xs font-semibold text-red-700" data-testid="error-team-profile-photo">{photoError}</p>}</div></div></div>{modal !== 'create' && <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/35 p-3 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block font-semibold">Show on public About page</span><span className="mt-0.5 block text-xs text-muted-foreground">Only the member’s name, department, and optional photo are shared.</span></span></label>}<div className="flex justify-end gap-2 pt-3"><Button variant="secondary" onClick={closeModal} testId="button-cancel-user">Cancel</Button><Button type="submit" testId="button-save-user" disabled={create.isPending || update.isPending || upload.isPending || updatePhoto.isPending}>{create.isPending || update.isPending || upload.isPending || updatePhoto.isPending ? 'Saving…' : 'Save member'}</Button></div></form></Modal>
  </AppShell>;
}

export function AttendancePage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const mine = useGetMyAttendance({ request: { cache: 'no-store' } });
  const matrix = useListAttendance({ query: { enabled: user.role !== Role.STAFF, queryKey: getListAttendanceQueryKey() }, request: { cache: 'no-store' } });
  const punch = usePunchAttendance();
  const [view, setView] = useState<'terminal' | 'matrix'>('terminal');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceFrom, setAttendanceFrom] = useState('');
  const [attendanceTo, setAttendanceTo] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState('ALL');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const [locationState, setLocationState] = useState<'idle' | 'requesting'>('idle');
  const [locationError, setLocationError] = useState('');
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = mine.data?.find((row) => row.date === todayKey);
  const isClockedIn = Boolean(today?.inTime && !today.outTime);
  const isShiftComplete = Boolean(today?.inTime && today.outTime);
  const punchAction = isClockedIn ? 'OUT' : 'IN';
  const doPunch = () => {
    if (isShiftComplete) {
      setLocationError('Today’s attendance is already complete. You can punch in again on the next working day.');
      return;
    }
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser. Please use a device with location access enabled.');
      return;
    }
    setLocationState('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState('idle');
        punch.mutate({
          data: {
            action: punchAction,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          },
        }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMyAttendanceQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
          },
          onError: (error) => setLocationError(error instanceof Error ? error.message : 'The attendance punch could not be recorded.'),
        });
      },
      (error) => {
        setLocationState('idle');
        setLocationError(error.code === error.PERMISSION_DENIED
          ? 'Location permission is required to punch attendance. Allow location access and try again.'
          : 'We could not determine your location. Check your device settings and try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  const filteredMatrix = (matrix.data ?? []).filter((row) =>
    (!attendanceSearch || row.userName.toLowerCase().includes(attendanceSearch.toLowerCase()))
    && (!attendanceFrom || row.date >= attendanceFrom)
    && (!attendanceTo || row.date <= attendanceTo)
    && (attendanceStatus === 'ALL' || row.status === attendanceStatus),
  );
  const attendanceQuery = new URLSearchParams();
  if (attendanceSearch) attendanceQuery.set('search', attendanceSearch);
  if (attendanceFrom) attendanceQuery.set('from', attendanceFrom);
  if (attendanceTo) attendanceQuery.set('to', attendanceTo);
  if (attendanceStatus !== 'ALL') attendanceQuery.set('status', attendanceStatus);
  const runAttendanceExport = async (kind: 'excel' | 'pdf') => {
    setExporting(kind);
    setExportError('');
    try {
      await downloadReport(`/api/attendance/export.${kind === 'excel' ? 'xlsx' : 'pdf'}${attendanceQuery.toString() ? `?${attendanceQuery.toString()}` : ''}`, `hydranet-attendance.${kind === 'excel' ? 'xls' : 'pdf'}`);
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The report could not be generated.');
    } finally {
      setExporting(null);
    }
  };
  return <AppShell user={user}><PageHeader eyebrow="Time & presence" title="Attendance terminal" description="Punch accurately, then review the rhythm of your regional teams." action={<div className="flex rounded-xl border border-border bg-card p-1"><button data-testid="button-attendance-terminal-tab" onClick={() => setView('terminal')} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'terminal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>My terminal</button><button data-testid="button-attendance-matrix-tab" onClick={() => setView('matrix')} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'matrix' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Team matrix</button></div>} />
    {view === 'terminal' || user.role === Role.STAFF ? <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><SectionCard className="overflow-hidden"><div className="bg-primary p-7 text-primary-foreground"><div className="mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">Today · {formatDate(new Date().toISOString())}</div><div className="mt-8 flex items-end justify-between"><div><div className="text-5xl font-bold tracking-[-0.07em]" data-testid="text-attendance-clock">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div><div className="mt-2 text-xs text-primary-foreground/60">Local network time</div></div><div className="rounded-2xl bg-primary-foreground/10 p-4"><Clock3 size={28} /></div></div></div><div className="p-6"><div className="flex items-center justify-between"><div><div className="text-sm font-bold">{isClockedIn ? 'You are on the clock' : 'Ready when you are'}</div><div className="mt-1 text-xs text-muted-foreground">{isClockedIn ? `Started at ${formatTime(today?.inTime)}` : 'Start your shift with one tap.'}</div></div><StatusPill label={isClockedIn ? 'PRESENT' : 'NOT PUNCHED'} tone={isClockedIn ? 'success' : 'neutral'} /></div><div className="mt-4 space-y-3"><Button onClick={doPunch} testId={`button-punch-${punchAction.toLowerCase()}`} disabled={punch.isPending || locationState === 'requesting'} variant={isClockedIn ? 'secondary' : 'primary'}>{locationState === 'requesting' ? <><MapPin size={15} /> Getting location…</> : punch.isPending ? 'Recording…' : isClockedIn ? <><ArrowDownRight size={15} /> Punch out</> : <><ArrowUpRight size={15} /> Punch in</>}</Button><div className="flex items-start gap-2 text-xs text-muted-foreground"><MapPin size={14} className="mt-0.5 shrink-0 text-primary" /><span>Location access is required for every punch and is saved with your attendance record.</span></div>{locationError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700" data-testid="error-attendance-location">{locationError}</div>}</div></div></SectionCard><SectionCard title="Your history" eyebrow="Recent punches">{mine.isLoading ? <SkeletonRows count={5} /> : mine.isError ? <div className="p-5"><ErrorNotice /></div> : !mine.data?.length ? <EmptyState icon={CalendarCheck} title="No attendance history" description="Your completed punches will appear here." /> : <div className="divide-y divide-border">{mine.data.slice(0, 7).map((row) => <div key={row.id} data-testid={`row-my-attendance-${row.id}`} className="flex items-center justify-between px-5 py-4"><div><div className="text-sm font-bold">{formatDate(row.date)}</div><div className="mt-1 text-xs text-muted-foreground">{formatTime(row.inTime)} → {formatTime(row.outTime)} {row.durationMinutes ? `· ${Math.round(row.durationMinutes / 60 * 10) / 10}h` : ''}</div></div><div className="flex items-center gap-3"><AttendanceLocation latitude={row.inLatitude} longitude={row.inLongitude} accuracyMeters={row.inAccuracyMeters} /><StatusPill label={row.status} tone={toneForStatus(row.status)} /></div></div>)}</div>}</SectionCard></div> : <><div className="mb-5 flex flex-wrap items-end gap-3"><div className="min-w-[190px] flex-1"><label className="text-xs font-semibold">Search person<input value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} placeholder="Name…" className="mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-attendance-search" /></label></div><label className="text-xs font-semibold">From<input type="date" value={attendanceFrom} onChange={(event) => setAttendanceFrom(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-attendance-from" /></label><label className="text-xs font-semibold">To<input type="date" value={attendanceTo} onChange={(event) => setAttendanceTo(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-attendance-to" /></label><label className="text-xs font-semibold">Status<select value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="select-filter-attendance-status"><option value="ALL">All statuses</option><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="HALF_DAY">Half day</option><option value="ABSENT">Absent</option></select></label></div><SectionCard title="Attendance matrix" eyebrow="Admin view" action={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => runAttendanceExport('excel')} testId="button-export-attendance-excel" disabled={exporting !== null}><FileSpreadsheet size={14} /> {exporting === 'excel' ? 'Preparing…' : 'Excel'}</Button><Button variant="secondary" onClick={() => runAttendanceExport('pdf')} testId="button-export-attendance-pdf" disabled={exporting !== null}><FileText size={14} /> {exporting === 'pdf' ? 'Preparing…' : 'PDF'}</Button><Button variant="secondary" onClick={() => { queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() }); }} testId="button-refresh-attendance"><RefreshCw size={14} /> Refresh</Button></div>}>{exportError && <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700" data-testid="error-attendance-export">{exportError}</div>}{matrix.isLoading ? <SkeletonRows /> : matrix.isError ? <div className="p-5"><ErrorNotice /></div> : !filteredMatrix.length ? <EmptyState icon={CalendarCheck} title="No attendance records" description={matrix.data?.length ? "No records match these filters." : "Once the team starts punching, the matrix will populate."} /> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Person</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">In</th><th className="px-5 py-4">In location</th><th className="px-5 py-4">Out</th><th className="px-5 py-4">Out location</th><th className="px-5 py-4">Duration</th><th className="px-5 py-4">Status</th></tr></thead><tbody className="divide-y divide-border">{filteredMatrix.map((row) => <tr key={row.id} data-testid={`row-attendance-${row.id}`} className="hover:bg-secondary/25"><td className="px-5 py-4 font-bold">{row.userName}</td><td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(row.date)}</td><td className="px-5 py-4 text-sm">{formatTime(row.inTime)}</td><td className="px-5 py-4"><AttendanceLocation latitude={row.inLatitude} longitude={row.inLongitude} accuracyMeters={row.inAccuracyMeters} /></td><td className="px-5 py-4 text-sm">{formatTime(row.outTime)}</td><td className="px-5 py-4"><AttendanceLocation latitude={row.outLatitude} longitude={row.outLongitude} accuracyMeters={row.outAccuracyMeters} /></td><td className="px-5 py-4 text-sm">{row.durationMinutes ? `${Math.round(row.durationMinutes / 60 * 10) / 10}h` : '—'}</td><td className="px-5 py-4"><StatusPill label={row.status} tone={toneForStatus(row.status)} /></td></tr>)}</tbody></table></div>}</SectionCard></>}
  </AppShell>;
}

export function ExpensesPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const query = useListExpenses();
  const create = useCreateExpense();
  const decide = useDecideExpense();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', category: ExpenseCategory.FIBER_MAINTENANCE, amount: '', date: new Date().toISOString().slice(0, 10), paymentMode: ExpenseInputPaymentMode.UPI, notes: '' });
  const [filter, setFilter] = useState('ALL');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseFrom, setExpenseFrom] = useState('');
  const [expenseTo, setExpenseTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const expenses = (query.data ?? []).filter((item) =>
    (filter === 'ALL' || item.status === filter)
    && (!expenseSearch || `${item.title} ${item.voucherId} ${item.submittedBy}`.toLowerCase().includes(expenseSearch.toLowerCase()))
    && (!expenseFrom || item.date >= expenseFrom)
    && (!expenseTo || item.date <= expenseTo),
  );
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { ...form, amount: Number(form.amount) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() }); setModal(false); setForm({ ...form, title: '', amount: '', notes: '' }); } }); };
  const decideClaim = (item: Expense, decision: 'APPROVED' | 'REJECTED') => { const comment = window.prompt(`Optional note for ${item.voucherId}`, '') ?? ''; decide.mutate({ id: item.id, data: { decision: decision === 'APPROVED' ? ExpenseDecisionInputDecision.APPROVED : ExpenseDecisionInputDecision.REJECTED, comment } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() }) }); };
  const expenseQuery = new URLSearchParams();
  if (expenseSearch) expenseQuery.set('search', expenseSearch);
  if (expenseFrom) expenseQuery.set('from', expenseFrom);
  if (expenseTo) expenseQuery.set('to', expenseTo);
  if (filter !== 'ALL') expenseQuery.set('status', filter);
  const runExpenseExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await downloadReport(`/api/expenses/export.pdf${expenseQuery.toString() ? `?${expenseQuery.toString()}` : ''}`, 'hydranet-expenses.pdf');
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The report could not be generated.');
    } finally {
      setExporting(false);
    }
  };
  return <AppShell user={user}><PageHeader eyebrow="Spend control" title="Expenses & approvals" description="Submit claims, see the ledger, and keep every rupee accountable." action={<Button onClick={() => setModal(true)} testId="button-create-expense"><Plus size={15} /> Submit expense</Button>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard testId="stat-expense-pending" label="Pending review" value={String((query.data ?? []).filter((item) => item.status === 'PENDING').length)} detail="Claims needing a decision" icon={Clock3} accent="orange" /><StatCard testId="stat-expense-approved" label="Approved this cycle" value={formatCurrency((query.data ?? []).filter((item) => item.status === 'APPROVED').reduce((sum, item) => sum + item.amount, 0))} detail="Committed spend" icon={CheckCircle2} accent="green" /><StatCard testId="stat-expense-total" label="Ledger total" value={formatCurrency((query.data ?? []).reduce((sum, item) => sum + item.amount, 0))} detail="All submitted claims" icon={IndianRupee} accent="blue" /></div>
     <div className="mb-5 flex flex-wrap items-end gap-3"><div className="min-w-[190px] flex-1"><label className="text-xs font-semibold">Search ledger<input value={expenseSearch} onChange={(event) => setExpenseSearch(event.target.value)} placeholder="Claim, voucher or person…" className="mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-expenses-search" /></label></div><label className="text-xs font-semibold">From<input type="date" value={expenseFrom} onChange={(event) => setExpenseFrom(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-expenses-from" /></label><label className="text-xs font-semibold">To<input type="date" value={expenseTo} onChange={(event) => setExpenseTo(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-filter-expenses-to" /></label></div><SectionCard action={<div className="flex flex-wrap items-center justify-end gap-2"><div className="flex flex-wrap gap-1">{['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((item) => <button key={item} onClick={() => setFilter(item)} data-testid={`button-filter-expenses-${item.toLowerCase()}`} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${filter === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>{item}</button>)}</div><Button variant="secondary" onClick={runExpenseExport} testId="button-export-expenses-pdf" disabled={exporting}><FileText size={14} /> {exporting ? 'Preparing…' : 'Export PDF'}</Button></div>} title="Expense ledger" eyebrow="Claims register">{exportError && <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700" data-testid="error-expense-export">{exportError}</div>}{query.isLoading ? <SkeletonRows /> : query.isError ? <div className="p-5"><ErrorNotice /></div> : expenses.length === 0 ? <EmptyState icon={Receipt} title="No claims in this view" description="Change the filter or submit the first expense claim." action={<Button onClick={() => setModal(true)} testId="button-empty-create-expense"><Plus size={15} /> Submit expense</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Voucher / claim</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Submitted by</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Decision</th></tr></thead><tbody className="divide-y divide-border">{expenses.map((item) => <tr key={item.id} data-testid={`row-expense-${item.id}`} className="hover:bg-secondary/25"><td className="px-5 py-4"><div className="font-bold">{item.title}</div><div className="mono mt-1 text-[10px] text-muted-foreground">{item.voucherId}</div></td><td className="px-5 py-4 text-xs">{item.category.replaceAll('_', ' ')}</td><td className="px-5 py-4 font-bold">{formatCurrency(item.amount)}<div className="text-[10px] font-normal text-muted-foreground">{item.paymentMode}</div></td><td className="px-5 py-4 text-xs">{item.submittedBy}</td><td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(item.date)}</td><td className="px-5 py-4"><StatusPill label={item.status} tone={toneForStatus(item.status)} /></td><td className="px-5 py-4 text-right">{item.status === 'PENDING' && user.role !== Role.STAFF ? <div className="flex justify-end gap-1"><button onClick={() => decideClaim(item, 'APPROVED')} data-testid={`button-approve-expense-${item.id}`} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" aria-label={`Approve ${item.title}`}><Check size={16} /></button><button onClick={() => decideClaim(item, 'REJECTED')} data-testid={`button-reject-expense-${item.id}`} className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label={`Reject ${item.title}`}><X size={16} /></button></div> : <span className="text-xs text-muted-foreground">{item.approvedBy ?? '—'}</span>}</td></tr>)}</tbody></table></div>}</SectionCard>
    <Modal open={modal} onClose={() => setModal(false)} title="Submit an expense claim"><form onSubmit={submit} className="space-y-4"><Field label="What was this for?" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="e.g. Fibre splice enclosure" required /><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value as typeof form.category })} options={Object.values(ExpenseCategory).map((value) => ({ value, label: value.replaceAll('_', ' ') }))} /><Field label="Amount (INR)" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} type="number" required /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Expense date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} type="date" required /><SelectField label="Payment mode" value={form.paymentMode} onChange={(value) => setForm({ ...form, paymentMode: value as typeof form.paymentMode })} options={Object.values(ExpenseInputPaymentMode).map((value) => ({ value, label: value }))} /></div><label className="block"><span className="mb-1.5 block text-xs font-semibold">Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Add context for the approver" className="min-h-[90px] w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary" /></label><div className="flex justify-end gap-2 pt-3"><Button variant="secondary" onClick={() => setModal(false)} testId="button-cancel-expense">Cancel</Button><Button type="submit" testId="button-save-expense" disabled={create.isPending}>{create.isPending ? 'Submitting…' : <><Receipt size={15} /> Submit claim</>}</Button></div></form></Modal>
  </AppShell>;
}

function SmtpSettingsCard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const settings = useGetSmtpSettings({ query: { queryKey: getGetSmtpSettingsQueryKey() } });
  const update = useUpdateSmtpSettings();
  const test = useTestSmtpSettings();
  const [form, setForm] = useState({
    host: '',
    port: '587',
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: 'Hydranet Broadband',
    replyTo: '',
    recipient: user.email,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!settings.data) return;
    setForm((current) => ({
      ...current,
      host: settings.data.host ?? '',
      port: String(settings.data.port ?? 587),
      secure: settings.data.secure,
      username: settings.data.username ?? '',
      fromEmail: settings.data.fromEmail ?? '',
      fromName: settings.data.fromName ?? 'Hydranet Broadband',
      replyTo: settings.data.replyTo ?? '',
    }));
  }, [settings.data]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    update.mutate({
      data: {
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        username: form.username.trim() || undefined,
        password: form.password || undefined,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
        replyTo: form.replyTo.trim() || undefined,
      },
    }, {
      onSuccess: () => {
        setForm((current) => ({ ...current, password: '' }));
        setMessage('SMTP settings saved securely.');
        queryClient.invalidateQueries({ queryKey: getGetSmtpSettingsQueryKey() });
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'The SMTP settings could not be saved.'),
    });
  };

  const sendTest = () => {
    setMessage('');
    setError('');
    test.mutate({ data: { recipient: form.recipient.trim() || user.email } }, {
      onSuccess: (result) => setMessage(result.message),
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'The SMTP test email could not be sent.'),
    });
  };

  return <SectionCard title="SMTP delivery" eyebrow="Superadmin only" action={<div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"><Server size={14} /> {settings.data?.configured ? 'Configured' : 'Not configured'}</div>}>
    <form onSubmit={save} className="p-5">
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
        <Mail size={19} className="mt-0.5 shrink-0 text-primary" />
        <div><div className="text-sm font-bold">Own SMTP server for ERP emails</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Only Superadmin can view or change these settings. The SMTP password is encrypted at rest and never returned to the browser.</p></div>
      </div>
      {settings.isLoading ? <SkeletonRows count={3} /> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="SMTP host" value={form.host} onChange={(value) => setForm({ ...form, host: value })} placeholder="smtp.example.com" required testId="input-smtp-host" />
        <Field label="Port" value={form.port} onChange={(value) => setForm({ ...form, port: value })} type="number" required testId="input-smtp-port" />
        <Field label="Username (optional)" value={form.username} onChange={(value) => setForm({ ...form, username: value })} autoComplete="username" testId="input-smtp-username" />
        <Field label={settings.data?.hasPassword ? 'New password (optional)' : 'Password (optional)'} value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" autoComplete="new-password" testId="input-smtp-password" />
        <Field label="From email" value={form.fromEmail} onChange={(value) => setForm({ ...form, fromEmail: value })} type="email" placeholder="no-reply@example.com" required testId="input-smtp-from-email" />
        <Field label="From name" value={form.fromName} onChange={(value) => setForm({ ...form, fromName: value })} required testId="input-smtp-from-name" />
        <Field label="Reply-to (optional)" value={form.replyTo} onChange={(value) => setForm({ ...form, replyTo: value })} type="email" testId="input-smtp-reply-to" />
        <Field label="Test recipient" value={form.recipient} onChange={(value) => setForm({ ...form, recipient: value })} type="email" required testId="input-smtp-test-recipient" />
      </div>}
      <label className="mt-4 flex items-center gap-3 text-xs font-semibold text-foreground"><input type="checkbox" checked={form.secure} onChange={(event) => setForm({ ...form, secure: event.target.checked })} className="h-4 w-4 accent-[var(--primary)]" data-testid="input-smtp-secure" /> Use secure TLS connection (recommended for port 465)</label>
      {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" data-testid="text-smtp-success">{message}</div>}
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="text-smtp-error">{error}</div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" disabled={update.isPending} testId="button-save-smtp-settings">{update.isPending ? 'Saving…' : 'Save SMTP settings'}</Button>
        <Button type="button" variant="secondary" onClick={sendTest} disabled={test.isPending || !settings.data?.configured} testId="button-test-smtp"><Send size={14} /> {test.isPending ? 'Sending…' : 'Send test email'}</Button>
      </div>
    </form>
  </SectionCard>;
}

export function SettingsPage({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState(false);
  return <AppShell user={user}><PageHeader eyebrow="Workspace controls" title="Portal settings" description="Your profile, session posture and the small choices that make the cockpit yours." />
    <div className="space-y-5">{user.role === Role.SUPERADMIN && <SmtpSettingsCard user={user} />}<div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><SectionCard title="Account profile" eyebrow="Signed-in identity"><div className="p-5"><div className="flex items-center gap-4 border-b border-border pb-5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">{initials(user.name)}</div><div><div className="text-lg font-bold" data-testid="text-settings-name">{user.name}</div><div className="mt-1 text-sm text-muted-foreground">{user.email}</div></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Role</div><div className="mt-2 text-sm font-semibold">{user.role}</div></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Department</div><div className="mt-2 text-sm font-semibold">{user.department}</div></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Phone</div><div className="mt-2 text-sm font-semibold">{user.phone || 'Not provided'}</div></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Member since</div><div className="mt-2 text-sm font-semibold">{formatDate(user.createdAt)}</div></div></div></div></SectionCard><SectionCard title="Portal preferences" eyebrow="Personal workspace"><div className="divide-y divide-border"><div className="flex items-center justify-between gap-4 p-5"><div><div className="text-sm font-bold">Compact data tables</div><div className="mt-1 text-xs text-muted-foreground">Use tighter rows when scanning long ledgers.</div></div><button data-testid="button-toggle-compact" onClick={() => setCompact(!compact)} className={`relative h-6 w-11 rounded-full transition-colors ${compact ? 'bg-primary' : 'bg-secondary'}`} aria-label="Toggle compact tables"><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${compact ? 'translate-x-6' : 'translate-x-1'}`} /></button></div><div className="flex items-center justify-between gap-4 p-5"><div><div className="text-sm font-bold">Session status</div><div className="mt-1 text-xs text-muted-foreground">Your workspace is protected and active.</div></div><StatusPill label="ACTIVE" tone="success" /></div></div></SectionCard><SectionCard title="Security posture" eyebrow="Access controls"><div className="space-y-3 p-5"><div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><ShieldCheck size={18} /><div><div className="font-bold">Protected session</div><div className="mt-0.5">Hydranet internal access is enabled for this account.</div></div></div><div className="flex items-center gap-3 rounded-xl border border-border p-3 text-xs"><LockKeyhole size={18} className="text-primary" /><div><div className="font-bold">Role-based permissions</div><div className="mt-0.5 text-muted-foreground">Your {user.role.toLowerCase()} role controls approvals and directory actions.</div></div></div></div></SectionCard><SectionCard title="Session actions" eyebrow="Account"><div className="flex flex-wrap gap-2 p-5"><Button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2200); }} testId="button-save-preferences">{saved ? <><Check size={15} /> Preferences saved</> : 'Save preferences'}</Button><Button variant="secondary" onClick={() => setLocation('/')} testId="button-settings-home">Back to overview</Button></div></SectionCard></div></div>
  </AppShell>;
}

export function RolePermissionsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const query = useListRolePermissions({ query: { queryKey: getListRolePermissionsQueryKey(), enabled: user.role === Role.SUPERADMIN } });
  const update = useUpdateRolePermissions();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const roles = query.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  useEffect(() => {
    if (selectedRole && selectedRole.id !== selectedRoleId) {
      setSelectedRoleId(selectedRole.id);
    }
  }, [selectedRole, selectedRoleId]);

  useEffect(() => {
    if (selectedRole) {
      setPermissionIds(selectedRole.permissions.filter((permission) => permission.enabled).map((permission) => permission.id));
      setSaved(false);
    }
  }, [selectedRole?.id]);

  const togglePermission = (permissionId: number) => {
    setPermissionIds((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]);
    setSaved(false);
  };

  const savePermissions = () => {
    if (!selectedRole) return;
    update.mutate(
      { id: selectedRole.id, data: { permissionIds } },
      {
        onSuccess: () => {
          setSaved(true);
          queryClient.invalidateQueries({ queryKey: getListRolePermissionsQueryKey() });
        },
      },
    );
  };

  if (user.role !== Role.SUPERADMIN) {
    return <AppShell user={user}><PageHeader eyebrow="Access controls" title="Role permissions" description="Permission changes are restricted to Superadmin accounts." /><ErrorNotice message="Only Superadmin users can view or change role permissions." /></AppShell>;
  }

  return <AppShell user={user}>
    <PageHeader eyebrow="Access controls" title="Role permissions" description="Decide what each Hydranet role can see, change, approve, and export." action={<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><ShieldCheck size={14} className="text-accent" /> Superadmin only</div>} />
    {query.isLoading ? <SectionCard><SkeletonRows count={5} /></SectionCard> : query.isError ? <ErrorNotice message="The role permission matrix could not be loaded." /> : <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      <SectionCard title="Roles" eyebrow="Access profiles">
        <div className="divide-y divide-border">
          {roles.map((role) => {
            const enabledCount = role.permissions.filter((permission) => permission.enabled).length;
            const active = role.id === selectedRole?.id;
            return <button key={role.id} onClick={() => setSelectedRoleId(role.id)} data-testid={`button-role-${role.code.toLowerCase()}`} className={`w-full p-5 text-left transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-bold">{role.code}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${active ? 'bg-primary-foreground/15' : 'bg-secondary text-muted-foreground'}`}>{enabledCount}/{role.permissions.length}</span></div>
              <div className={`mt-2 text-xs leading-5 ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{role.description}</div>
            </button>;
          })}
        </div>
      </SectionCard>
      <SectionCard title={selectedRole ? `${selectedRole.code} permissions` : 'Choose a role'} eyebrow="Permission matrix" action={selectedRole ? <Button onClick={savePermissions} testId="button-save-role-permissions" disabled={update.isPending}>{update.isPending ? 'Saving…' : saved ? 'Permissions saved' : 'Save permissions'}</Button> : undefined}>
        {selectedRole ? <div className="divide-y divide-border">
          {selectedRole.permissions.map((permission) => {
            const enabled = permissionIds.includes(permission.id);
            return <label key={permission.id} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 hover:bg-secondary/40" data-testid={`row-permission-${permission.code.toLowerCase()}`}>
              <span className="min-w-0"><span className="block text-sm font-bold">{permission.code.replaceAll('_', ' ')}</span><span className="mt-1 block text-xs text-muted-foreground">{permission.description}</span></span>
              <input type="checkbox" checked={enabled} onChange={() => togglePermission(permission.id)} className="h-5 w-5 shrink-0 accent-[var(--primary)]" aria-label={`${permission.code} permission`} />
            </label>;
          })}
        </div> : <EmptyState icon={ShieldCheck} title="Choose a role" description="Select a role to configure its access." />}
      </SectionCard>
    </div>}
  </AppShell>;
}

const salaryFormDefaults = {
  basicSalary: '25000',
  hra: '10000',
  conveyanceAllowance: '2000',
  medicalAllowance: '1500',
  otherAllowance: '1000',
  pfRate: '12',
  esiRate: '0',
  professionalTax: '200',
  otherDeduction: '0',
  effectiveFrom: new Date().toISOString().slice(0, 10),
};

export function HrPayrollPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'attendance' | 'salary' | 'payroll'>('attendance');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employeeId, setEmployeeId] = useState('all');
  const [salaryModal, setSalaryModal] = useState<SalaryStructure | null>(null);
  const [salaryForm, setSalaryForm] = useState(salaryFormDefaults);
  const [exporting, setExporting] = useState<string | null>(null);
  const monthly = useListMonthlyAttendance(
    { month, ...(employeeId === 'all' ? {} : { userId: Number(employeeId) }) },
    { query: { queryKey: getListMonthlyAttendanceQueryKey({ month, ...(employeeId === 'all' ? {} : { userId: Number(employeeId) }) }) } },
  );
  const structures = useListSalaryStructures();
  const payroll = useGetPayroll(
    { month },
    { query: { queryKey: getGetPayrollQueryKey({ month }) } },
  );
  const updateSalary = useUpdateSalaryStructure();
  const generate = useGeneratePayroll();
  const reports = monthly.data ?? [];
  const salaryRows = structures.data ?? [];
  const payslips = payroll.data?.payslips ?? [];
  const selectedReport = reports[0];

  const openSalaryEditor = (structure: SalaryStructure) => {
    setSalaryModal(structure);
    setSalaryForm({
      basicSalary: String(structure.basicSalary),
      hra: String(structure.hra),
      conveyanceAllowance: String(structure.conveyanceAllowance),
      medicalAllowance: String(structure.medicalAllowance),
      otherAllowance: String(structure.otherAllowance),
      pfRate: String(structure.pfRate),
      esiRate: String(structure.esiRate),
      professionalTax: String(structure.professionalTax),
      otherDeduction: String(structure.otherDeduction),
      effectiveFrom: structure.effectiveFrom.slice(0, 10),
    });
  };

  const saveSalary = (event: FormEvent) => {
    event.preventDefault();
    if (!salaryModal) return;
    updateSalary.mutate({
      userId: salaryModal.userId,
      data: {
        basicSalary: Number(salaryForm.basicSalary),
        hra: Number(salaryForm.hra),
        conveyanceAllowance: Number(salaryForm.conveyanceAllowance),
        medicalAllowance: Number(salaryForm.medicalAllowance),
        otherAllowance: Number(salaryForm.otherAllowance),
        pfRate: Number(salaryForm.pfRate),
        esiRate: Number(salaryForm.esiRate),
        professionalTax: Number(salaryForm.professionalTax),
        otherDeduction: Number(salaryForm.otherDeduction),
        effectiveFrom: salaryForm.effectiveFrom,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSalaryStructuresQueryKey() });
        setSalaryModal(null);
      },
    });
  };

  const calculatePayroll = () => {
    generate.mutate({ data: { month } }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetPayrollQueryKey({ month }), result);
        queryClient.invalidateQueries({ queryKey: getGetPayrollQueryKey({ month }) });
      },
    });
  };

  const downloadMonthlyAttendance = async () => {
    setExporting('attendance');
    try {
      const query = new URLSearchParams({ month });
      if (employeeId !== 'all') query.set('userId', employeeId);
      await downloadReport(`/api/attendance/monthly.pdf?${query.toString()}`, `hydranet-attendance-${month}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const downloadPayslip = async (payslip: Payslip) => {
    setExporting(`payslip-${payslip.id}`);
    try {
      await downloadReport(`/api/hr/payslips/${payslip.id}.pdf`, `hydranet-payslip-${payslip.month}-${payslip.userId}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  if (user.role === Role.STAFF) {
    return <AppShell user={user}><PageHeader eyebrow="Human resources" title="HR & payroll" description="Salary and payroll controls are restricted to Admin and Superadmin users." /><ErrorNotice message="Your role does not have access to HR management." /></AppShell>;
  }

  return <AppShell user={user}>
    <PageHeader
      eyebrow="Human resources"
      title="HR & payroll"
      description="Turn attendance into a clear monthly record, a configurable salary structure, and an auditable payslip."
      action={<div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {[
          ['attendance', 'Monthly attendance'],
          ['salary', 'Salary structures'],
          ['payroll', 'Payroll & payslips'],
        ].map(([value, label]) => <button key={value} onClick={() => setTab(value as typeof tab)} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`} data-testid={`button-hr-tab-${value}`}>{label}</button>)}
      </div>}
    />

    {tab === 'attendance' && <section>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Report month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-hr-attendance-month" /></label>
        <label className="min-w-[220px] flex-1 text-xs font-semibold">Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="select-hr-attendance-employee"><option value="all">All active employees</option>{salaryRows.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.employeeName} · {employee.department}</option>)}</select></label>
        <Button variant="secondary" onClick={downloadMonthlyAttendance} testId="button-download-monthly-attendance" disabled={exporting !== null}><Download size={14} /> {exporting === 'attendance' ? 'Preparing…' : 'Download monthly PDF'}</Button>
      </div>
      {monthly.isLoading ? <SectionCard><SkeletonRows count={5} /></SectionCard> : monthly.isError ? <ErrorNotice message="The monthly attendance report could not be loaded." /> : <><div className="mb-5 grid gap-4 sm:grid-cols-3"><StatCard testId="stat-hr-employees" label="Employees" value={String(reports.length)} detail="Included in this report" icon={UsersRound} accent="blue" /><StatCard testId="stat-hr-working-days" label="Working days" value={String(selectedReport?.workingDays ?? 0)} detail={`${month} reporting period`} icon={CalendarDays} accent="orange" /><StatCard testId="stat-hr-attendance-rate" label="Average attendance" value={reports.length ? `${(reports.reduce((sum, report) => sum + report.attendanceRate, 0) / reports.length).toFixed(1)}%` : '0%'} detail="Paid-day attendance rate" icon={CalendarCheck} accent="green" /></div>
        <SectionCard title="Employee monthly summary" eyebrow="Attendance report">
          {!reports.length ? <EmptyState icon={CalendarCheck} title="No active employees found" description="The selected month does not have an employee report yet." /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Employee</th><th className="px-5 py-4">Department</th><th className="px-5 py-4">Work days</th><th className="px-5 py-4">Present</th><th className="px-5 py-4">Late</th><th className="px-5 py-4">Half day</th><th className="px-5 py-4">Absent</th><th className="px-5 py-4">Hours</th><th className="px-5 py-4">Rate</th></tr></thead><tbody className="divide-y divide-border">{reports.map((report) => <tr key={report.userId} data-testid={`row-monthly-attendance-${report.userId}`} className="hover:bg-secondary/25"><td className="px-5 py-4 font-bold">{report.userName}</td><td className="px-5 py-4 text-xs text-muted-foreground">{report.department}</td><td className="px-5 py-4">{report.workingDays}</td><td className="px-5 py-4 text-emerald-700">{report.presentDays}</td><td className="px-5 py-4 text-amber-700">{report.lateDays}</td><td className="px-5 py-4">{report.halfDays}</td><td className="px-5 py-4 text-red-700">{report.absentDays}</td><td className="px-5 py-4">{(report.totalMinutes / 60).toFixed(1)}h</td><td className="px-5 py-4"><StatusPill label={`${report.attendanceRate}%`} tone={report.attendanceRate >= 90 ? 'success' : report.attendanceRate >= 75 ? 'warning' : 'danger'} /></td></tr>)}</tbody></table></div>}
        </SectionCard>
        {selectedReport && <SectionCard className="mt-5" title={`${selectedReport.userName} daily detail`} eyebrow={`Employee record · ${selectedReport.month}`}><div className="divide-y divide-border">{selectedReport.records.length ? selectedReport.records.map((record) => <div key={record.id} className="flex items-center justify-between px-5 py-3"><div><div className="text-sm font-bold">{formatDate(record.date)}</div><div className="mt-1 text-xs text-muted-foreground">{formatTime(record.inTime)} → {formatTime(record.outTime)}{record.durationMinutes ? ` · ${(record.durationMinutes / 60).toFixed(1)}h` : ''}</div></div><StatusPill label={record.status} tone={toneForStatus(record.status)} /></div>) : <EmptyState icon={CalendarCheck} title="No daily records" description="There are no punches recorded for this employee in the selected month." />}</div></SectionCard>}
      </>}
    </section>}

    {tab === 'salary' && <section>
      <div className="mb-5 grid gap-4 sm:grid-cols-3"><StatCard testId="stat-hr-salary-employees" label="Employee structures" value={String(salaryRows.length)} detail="Active employees in HR" icon={UsersRound} accent="blue" /><StatCard testId="stat-hr-configured" label="Configured" value={String(salaryRows.filter((row) => row.id > 0).length)} detail="Ready for payroll" icon={CheckCircle2} accent="green" /><StatCard testId="stat-hr-structure-total" label="Monthly gross" value={formatCurrency(salaryRows.reduce((sum, row) => sum + row.basicSalary + row.hra + row.conveyanceAllowance + row.medicalAllowance + row.otherAllowance, 0))} detail="Configured base gross" icon={WalletCards} accent="orange" /></div>
      <SectionCard title="Salary structure register" eyebrow="Employee compensation"><div className="overflow-x-auto">{structures.isLoading ? <SkeletonRows count={6} /> : structures.isError ? <div className="p-5"><ErrorNotice message="Salary structures could not be loaded." /></div> : <table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Employee</th><th className="px-5 py-4">Basic</th><th className="px-5 py-4">Allowances</th><th className="px-5 py-4">Gross</th><th className="px-5 py-4">PF / ESI</th><th className="px-5 py-4">Fixed deductions</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{salaryRows.map((row) => { const allowances = row.hra + row.conveyanceAllowance + row.medicalAllowance + row.otherAllowance; const gross = row.basicSalary + allowances; return <tr key={row.userId} data-testid={`row-salary-structure-${row.userId}`} className="hover:bg-secondary/25"><td className="px-5 py-4"><div className="font-bold">{row.employeeName}</div><div className="mt-1 text-xs text-muted-foreground">{row.department} · effective {formatDate(row.effectiveFrom)}</div></td><td className="px-5 py-4 font-semibold">{formatCurrency(row.basicSalary)}</td><td className="px-5 py-4">{formatCurrency(allowances)}</td><td className="px-5 py-4 font-bold">{formatCurrency(gross)}</td><td className="px-5 py-4 text-xs">{row.pfRate}% / {row.esiRate}%</td><td className="px-5 py-4 text-xs">{formatCurrency(row.professionalTax + row.otherDeduction)}</td><td className="px-5 py-4 text-right"><Button variant="secondary" onClick={() => openSalaryEditor(row)} testId={`button-edit-salary-${row.userId}`}><Pencil size={14} /> Edit structure</Button></td></tr>; })}</tbody></table>}</div></SectionCard>
    </section>}

    {tab === 'payroll' && <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><label className="text-xs font-semibold">Payroll month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary" data-testid="input-hr-payroll-month" /></label><Button onClick={calculatePayroll} testId="button-generate-payroll" disabled={generate.isPending}>{generate.isPending ? <><Calculator size={14} /> Calculating…</> : <><Calculator size={14} /> Calculate payroll</>}</Button></div>
      {payroll.isLoading ? <SectionCard><SkeletonRows count={5} /></SectionCard> : payroll.isError ? <ErrorNotice message="Payroll could not be loaded for this month." /> : payroll.data?.status !== 'GENERATED' ? <SectionCard><EmptyState icon={WalletCards} title={`Payroll not generated for ${month}`} description="Payroll uses each employee's salary structure and monthly attendance to calculate gross pay, attendance deduction, PF, ESI, professional tax and net salary." action={<Button onClick={calculatePayroll} testId="button-empty-generate-payroll"><Calculator size={14} /> Calculate payroll</Button>} /></SectionCard> : <><div className="mb-5 grid gap-4 sm:grid-cols-3"><StatCard testId="stat-payroll-gross" label="Gross payroll" value={formatCurrency(payslips.reduce((sum, slip) => sum + slip.grossSalary, 0))} detail={`${payslips.length} payslips generated`} icon={WalletCards} accent="blue" /><StatCard testId="stat-payroll-deductions" label="Deductions" value={formatCurrency(payslips.reduce((sum, slip) => sum + slip.totalDeductions, 0))} detail="Attendance + statutory + fixed" icon={ArrowDownRight} accent="orange" /><StatCard testId="stat-payroll-net" label="Net payable" value={formatCurrency(payslips.reduce((sum, slip) => sum + slip.netSalary, 0))} detail="Ready for disbursement" icon={BadgeIndianRupee} accent="green" /></div><SectionCard title={`Payslips · ${month}`} eyebrow="Generated payroll" action={<StatusPill label="GENERATED" tone="success" />}><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Employee</th><th className="px-5 py-4">Paid days</th><th className="px-5 py-4">Gross</th><th className="px-5 py-4">Attendance cut</th><th className="px-5 py-4">Deductions</th><th className="px-5 py-4">Net salary</th><th className="px-5 py-4 text-right">Payslip</th></tr></thead><tbody className="divide-y divide-border">{payslips.map((slip) => <tr key={slip.id} data-testid={`row-payslip-${slip.id}`} className="hover:bg-secondary/25"><td className="px-5 py-4"><div className="font-bold">{slip.employeeName}</div><div className="mt-1 text-xs text-muted-foreground">{slip.department}</div></td><td className="px-5 py-4">{slip.paidDays}</td><td className="px-5 py-4 font-semibold">{formatCurrency(slip.grossSalary)}</td><td className="px-5 py-4 text-amber-700">{formatCurrency(slip.attendanceDeduction)}</td><td className="px-5 py-4">{formatCurrency(slip.totalDeductions)}</td><td className="px-5 py-4 font-bold text-emerald-700">{formatCurrency(slip.netSalary)}</td><td className="px-5 py-4 text-right"><Button variant="secondary" onClick={() => downloadPayslip(slip)} testId={`button-download-payslip-${slip.id}`} disabled={exporting !== null}><FileText size={14} /> {exporting === `payslip-${slip.id}` ? 'Preparing…' : 'PDF'}</Button></td></tr>)}</tbody></table></div></SectionCard></>}
    </section>}

    <Modal open={Boolean(salaryModal)} onClose={() => setSalaryModal(null)} title={salaryModal ? `Salary structure · ${salaryModal.employeeName}` : 'Salary structure'}>
      <form onSubmit={saveSalary} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Basic salary (INR)" value={salaryForm.basicSalary} onChange={(value) => setSalaryForm({ ...salaryForm, basicSalary: value })} type="number" required /><Field label="HRA (INR)" value={salaryForm.hra} onChange={(value) => setSalaryForm({ ...salaryForm, hra: value })} type="number" required /><Field label="Conveyance (INR)" value={salaryForm.conveyanceAllowance} onChange={(value) => setSalaryForm({ ...salaryForm, conveyanceAllowance: value })} type="number" required /><Field label="Medical allowance (INR)" value={salaryForm.medicalAllowance} onChange={(value) => setSalaryForm({ ...salaryForm, medicalAllowance: value })} type="number" required /><Field label="Other allowance (INR)" value={salaryForm.otherAllowance} onChange={(value) => setSalaryForm({ ...salaryForm, otherAllowance: value })} type="number" required /><Field label="Effective from" value={salaryForm.effectiveFrom} onChange={(value) => setSalaryForm({ ...salaryForm, effectiveFrom: value })} type="date" required /></div>
        <div className="border-t border-border pt-4"><div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-primary">Automatic deductions</div><div className="grid gap-4 sm:grid-cols-2"><Field label="PF rate (%)" value={salaryForm.pfRate} onChange={(value) => setSalaryForm({ ...salaryForm, pfRate: value })} type="number" required /><Field label="ESI rate (%)" value={salaryForm.esiRate} onChange={(value) => setSalaryForm({ ...salaryForm, esiRate: value })} type="number" required /><Field label="Professional tax (INR)" value={salaryForm.professionalTax} onChange={(value) => setSalaryForm({ ...salaryForm, professionalTax: value })} type="number" required /><Field label="Other deduction (INR)" value={salaryForm.otherDeduction} onChange={(value) => setSalaryForm({ ...salaryForm, otherDeduction: value })} type="number" required /></div></div>
        <div className="flex justify-end gap-2 pt-3"><Button variant="secondary" onClick={() => setSalaryModal(null)} testId="button-cancel-salary">Cancel</Button><Button type="submit" testId="button-save-salary" disabled={updateSalary.isPending}>{updateSalary.isPending ? 'Saving…' : 'Save structure'}</Button></div>
      </form>
    </Modal>
  </AppShell>;
}
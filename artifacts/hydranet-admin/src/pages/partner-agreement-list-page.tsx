import { useMemo, useState } from 'react';
import { Download, ExternalLink, FileSignature, KeyRound, Link2, Printer, Search, ShieldCheck, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListPartnerAgreementsQueryKey,
  useApprovePartnerAgreement,
  useAttachPartnerSignedAgreement,
  downloadPartnerAgreementPdf,
  useRequestStorageUploadUrl,
  useListPartnerAgreements,
  useUpdatePartnerPortalDetails,
} from '@workspace/api-client-react';
import type { PartnerAgreement, User } from '@workspace/api-client-react';
import {
  AppShell,
  EmptyState,
  ErrorNotice,
  formatDate,
  PageHeader,
  SectionCard,
  SkeletonRows,
} from '@/components/admin-shell';
import { Button, Field } from '@/pages/admin-pages';

const documentLabels: Record<string, string> = {
  trade_license: 'Trade licence',
  pan: 'PAN',
  aadhaar: 'Aadhaar',
  bank_statement: 'Bank statement',
  cancelled_cheque: 'Cancelled cheque',
  signed_agreement: 'Signed agreement',
};

async function downloadPdf(id: number) {
  const blob = await downloadPartnerAgreementPdf(id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hydranet-${id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function printPdf(id: number) {
  const blob = await downloadPartnerAgreementPdf(id);
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (printWindow) printWindow.focus();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function PartnerCard({ agreement, canManage }: { agreement: PartnerAgreement; canManage: boolean }) {
  const queryClient = useQueryClient();
  const requestUploadUrl = useRequestStorageUploadUrl();
  const attachSignedAgreement = useAttachPartnerSignedAgreement();
  const approveAgreement = useApprovePartnerAgreement();
  const updatePortalDetails = useUpdatePartnerPortalDetails();
  const [uploading, setUploading] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState(agreement.portalDetails.url ?? '');
  const [portalUsername, setPortalUsername] = useState(agreement.portalDetails.username ?? '');
  const [portalPassword, setPortalPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const signedAgreement = agreement.documents.find((document) => document.type === 'signed_agreement');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListPartnerAgreementsQueryKey() });
  };

  const uploadSignedAgreement = async (file?: File) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const contentType = file.type || 'application/pdf';
      const upload = await requestUploadUrl.mutateAsync({ data: { name: file.name, size: file.size, contentType } });
      const uploaded = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!uploaded.ok) throw new Error('The signed agreement upload could not be completed.');
      await attachSignedAgreement.mutateAsync({
        id: agreement.id,
        data: { name: file.name, objectPath: upload.objectPath, size: file.size, contentType },
      });
      refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The signed agreement could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const approve = () => {
    setError('');
    approveAgreement.mutate({ id: agreement.id }, {
      onSuccess: refresh,
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'The agreement could not be approved.'),
    });
  };

  const savePortalDetails = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    updatePortalDetails.mutate({
      id: agreement.id,
      data: {
        url: portalUrl.trim(),
        username: portalUsername.trim(),
        password: portalPassword.trim() || undefined,
      },
    }, {
      onSuccess: () => {
        setPortalPassword('');
        setSuccess('Portal details saved and the welcome email with the signed agreement was sent.');
        refresh();
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'The portal details could not be saved.'),
    });
  };

  return <article className="border-b border-border p-5 last:border-b-0">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSignature size={21} /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-foreground">{agreement.partnerName}</h3><span className="rounded-lg bg-accent/15 px-2.5 py-1 font-mono text-xs font-bold text-accent">{agreement.partnerCode}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{agreement.entityType} · {agreement.mobileNumber}{agreement.email ? ` · ${agreement.email}` : ''}</p>
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{agreement.businessAddress}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void printPdf(agreement.id)} testId={`button-print-agreement-${agreement.id}`}><Printer size={14} /> Print</Button>
        <Button variant="secondary" onClick={() => void downloadPdf(agreement.id)} testId={`button-download-agreement-${agreement.id}`}><Download size={14} /> Download PDF</Button>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Agreement: {formatDate(agreement.agreementDate)}</span>
      <span>·</span>
      <span className={`status-pill ${agreement.status === 'APPROVED' ? 'status-success' : 'status-warning'}`}>{agreement.status}</span>
      {agreement.documents.map((document) => <a key={document.type} href={`/api/storage${document.objectPath}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-1 font-medium text-foreground hover:border-primary hover:text-primary"><ExternalLink size={11} /> {documentLabels[document.type] ?? document.type}</a>)}
    </div>
    {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
    {success && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canManage && agreement.status !== 'APPROVED' && <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3.5 text-xs font-bold text-primary hover:bg-primary/10">
        <UploadCloud size={14} />
        {uploading ? 'Uploading…' : signedAgreement ? 'Replace signed agreement' : 'Upload signed agreement'}
        <input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={uploading} onChange={(event) => { void uploadSignedAgreement(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      </label>}
      {canManage && agreement.status === 'SIGNED_UPLOADED' && <Button onClick={approve} disabled={approveAgreement.isPending} testId={`button-approve-partner-${agreement.id}`}><ShieldCheck size={14} /> {approveAgreement.isPending ? 'Approving…' : 'Approve agreement'}</Button>}
      {agreement.status === 'APPROVED' && <Button variant="secondary" onClick={() => setPortalOpen((open) => !open)} testId={`button-open-portal-details-${agreement.id}`}><KeyRound size={14} /> {portalOpen ? 'Close portal details' : canManage ? 'Partner portal details' : 'View portal details'}</Button>}
    </div>
    {agreement.status === 'APPROVED' && portalOpen && canManage && <form onSubmit={savePortalDetails} className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><KeyRound size={15} className="text-primary" /> Partner portal access & welcome email</div>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">Saving sends the partner a branded welcome email with these portal details and the signed agreement attached. Passwords are encrypted at rest and are never shown back in the partner list.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Portal URL" type="url" value={portalUrl} onChange={setPortalUrl} required testId={`input-portal-url-${agreement.id}`} />
        <Field label="Username" value={portalUsername} onChange={setPortalUsername} required testId={`input-portal-username-${agreement.id}`} />
        <Field label={agreement.portalDetails.hasPassword ? 'New password (optional)' : 'Password'} type="password" value={portalPassword} onChange={setPortalPassword} required={!agreement.portalDetails.hasPassword} testId={`input-portal-password-${agreement.id}`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={updatePortalDetails.isPending} testId={`button-save-portal-details-${agreement.id}`}>{updatePortalDetails.isPending ? 'Saving & emailing…' : 'Save & email portal details'}</Button>
        {agreement.portalDetails.url && <a href={agreement.portalDetails.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-foreground hover:bg-secondary"><Link2 size={14} /> Open portal</a>}
      </div>
    </form>}
    {agreement.status === 'APPROVED' && portalOpen && !canManage && <div className="mt-4 rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><KeyRound size={15} className="text-primary" /> Partner portal access <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">View only</span></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Portal URL" type="url" value={portalUrl} onChange={setPortalUrl} disabled testId={`input-portal-url-${agreement.id}`} />
        <Field label="Username" value={portalUsername} onChange={setPortalUsername} disabled testId={`input-portal-username-${agreement.id}`} />
        <div><span className="mb-1.5 block text-xs font-semibold text-foreground">Password</span><div className="flex h-10 items-center rounded-xl border border-input bg-secondary px-3 text-sm text-muted-foreground">{agreement.portalDetails.hasPassword ? 'Configured' : 'Not configured'}</div></div>
      </div>
      {agreement.portalDetails.url && <a href={agreement.portalDetails.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-foreground hover:bg-secondary"><Link2 size={14} /> Open portal</a>}
    </div>}
  </article>;
}

export function PartnerAgreementListPage({ user }: { user: User }) {
  const list = useListPartnerAgreements();
  const canManage = user.role !== 'STAFF';
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return list.data ?? [];
    return (list.data ?? []).filter((agreement) => [agreement.partnerCode, agreement.partnerName, agreement.mobileNumber, agreement.businessAddress].some((field) => field.toLowerCase().includes(value)));
  }, [list.data, search]);

  return <AppShell user={user}>
    <PageHeader eyebrow="Network growth" title="Partner list" description={canManage ? "Find registered partners by code, name, phone, or location and print or download their completed agreement." : "View registered partner details, agreements, and documents. Staff access is read-only."} action={canManage ? <Button onClick={() => window.location.assign(`${import.meta.env.BASE_URL}partner-agreements/new`)} testId="button-new-partner-agreement"><FileSignature size={15} /> Create partner agreement</Button> : undefined} />
    <SectionCard eyebrow="Partner directory" title={`${list.data?.length ?? 0} registered partners`} action={<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search partners…" className="h-9 w-56 rounded-xl border border-input bg-card pl-9 pr-3 text-xs outline-none focus:border-primary" data-testid="input-search-partners" /></div>}>
       {list.isLoading ? <SkeletonRows count={5} /> : list.isError ? <ErrorNotice /> : filtered.length ? filtered.map((agreement) => <PartnerCard key={agreement.id} agreement={agreement} canManage={canManage} />) : <EmptyState icon={FileSignature} title={search ? 'No matching partners' : 'No partners registered yet'} description={search ? 'Try a different code, name, phone, or location.' : canManage ? 'Create the first partner agreement to populate this directory.' : 'No partner agreements are available to view yet.'} />}
    </SectionCard>
  </AppShell>;
}
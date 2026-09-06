import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  UserRound,
  WalletCards,
} from 'lucide-react';
import {
  CustomerLedgerEntryEntryType,
  CustomerStatus,
  getListCustomerLedgerQueryKey,
  getListCustomersQueryKey,
  useCreateCustomer,
  useCreateCustomerLedgerEntry,
  useDeleteCustomer,
  useImportCustomers,
  useListCustomerLedger,
  useListCustomers,
  useListPlans,
  useUpdateCustomer,
  Role,
} from '@workspace/api-client-react';
import type {
  Customer,
  CustomerLedgerEntry,
  CustomerInput,
  CustomerLedgerInput,
  ListCustomersParams,
  Plan,
} from '@workspace/api-client-react';
import {
  AppShell,
  EmptyState,
  ErrorNotice,
  formatCurrency,
  formatDate,
  PageHeader,
  SearchField,
  SectionCard,
  SkeletonRows,
  StatCard,
  StatusPill,
} from '@/components/admin-shell';
import { Button, Field, Modal, SelectField } from '@/pages/admin-pages';
import type { User } from '@workspace/api-client-react';

type CustomerForm = {
  name: string;
  mobileNumber: string;
  radiusAccountNumber: string;
  username: string;
  planId: string;
  status: CustomerStatus;
};

type LedgerForm = {
  entryType: CustomerLedgerEntryEntryType;
  amount: string;
  entryDate: string;
  note: string;
};

function toneForCustomerStatus(status: CustomerStatus) {
  if (status === CustomerStatus.ACTIVE) return 'success' as const;
  if (status === CustomerStatus.SUSPENDED) return 'warning' as const;
  return 'danger' as const;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCustomerForm(planId = ''): CustomerForm {
  return {
    name: '',
    mobileNumber: '',
    radiusAccountNumber: '',
    username: '',
    planId,
    status: CustomerStatus.ACTIVE,
  };
}

function emptyLedgerForm(): LedgerForm {
  return {
    entryType: CustomerLedgerEntryEntryType.DEBIT,
    amount: '',
    entryDate: todayIso(),
    note: '',
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function CustomerFormModal({
  open,
  customer,
  plans,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [form, setForm] = useState<CustomerForm>(() => emptyCustomerForm());
  const [error, setError] = useState('');

  const activePlanOptions = plans
    .filter((plan) => plan.status === 'ACTIVE' || plan.id === Number(form.planId))
    .map((plan) => ({ label: `${plan.name} · ${formatCurrency(plan.price)}`, value: String(plan.id) }));

  const openKey = open ? `${customer?.id ?? 'new'}-${plans.length}` : 'closed';
  const [lastOpenKey, setLastOpenKey] = useState('closed');
  useEffect(() => {
    if (openKey !== lastOpenKey) {
      setLastOpenKey(openKey);
      setError('');
      setForm(customer
        ? {
            name: customer.name,
            mobileNumber: customer.mobileNumber,
            radiusAccountNumber: customer.radiusAccountNumber,
            username: customer.username,
            planId: String(customer.planId),
            status: customer.status,
          }
        : emptyCustomerForm(plans[0] ? String(plans[0].id) : ''));
    }
  }, [customer, lastOpenKey, openKey, plans]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const name = form.name.trim();
    const mobileNumber = form.mobileNumber.trim();
    const radiusAccountNumber = form.radiusAccountNumber.trim();
    const username = form.username.trim();
    const planId = Number(form.planId);
    if (!name || !mobileNumber || !radiusAccountNumber || !username || !Number.isInteger(planId) || planId < 1) {
      setError('Complete each account field and choose a valid plan.');
      return;
    }
    const data = { name, mobileNumber, radiusAccountNumber, username, planId, status: form.status };
    if (customer) {
      update.mutate({ id: customer.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          onSaved();
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError, 'The customer could not be updated.')),
      });
    } else {
      create.mutate({ data: data as CustomerInput }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          onSaved();
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError, 'The customer could not be created.')),
      });
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Modal open={open} onClose={onClose} title={customer ? 'Edit customer account' : 'Create customer account'}>
      <form onSubmit={submit} className="space-y-4" data-testid="form-customer">
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          Keep the RADIUS identifiers exact. They are used by operations to verify the account on the access server.
        </div>
        <Field testId="input-customer-name" label="Customer name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Asha Menon" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field testId="input-customer-mobile" label="Mobile number" value={form.mobileNumber} onChange={(value) => setForm({ ...form, mobileNumber: value })} placeholder="+91 98…" required />
          <Field testId="input-customer-radius-account" label="RADIUS account number" value={form.radiusAccountNumber} onChange={(value) => setForm({ ...form, radiusAccountNumber: value })} placeholder="HN-24018" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field testId="input-customer-username" label="RADIUS username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} placeholder="asha.menon" required />
          <SelectField testId="select-customer-plan" label="Assigned plan" value={form.planId} onChange={(value) => setForm({ ...form, planId: value })} options={activePlanOptions.length ? activePlanOptions : [{ label: 'No plans available', value: '' }]} />
        </div>
        <SelectField
          testId="select-customer-status"
          label="Account status"
          value={form.status}
          onChange={(value) => setForm({ ...form, status: value as CustomerStatus })}
          options={[
            { label: 'Active', value: CustomerStatus.ACTIVE },
            { label: 'Suspended', value: CustomerStatus.SUSPENDED },
            { label: 'Disconnected', value: CustomerStatus.DISCONNECTED },
          ]}
        />
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="error-customer-form">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} testId="button-cancel-customer">Cancel</Button>
          <Button type="submit" disabled={pending || activePlanOptions.length === 0} testId="button-save-customer">
            {pending ? 'Saving…' : customer ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const queryClient = useQueryClient();
  const importCustomers = useImportCustomers();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [downloadingSample, setDownloadingSample] = useState(false);
  const [result, setResult] = useState<{ importedCount: number; updatedCount: number; failedCount: number; errors: string[] } | null>(null);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Choose an Excel workbook before importing.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result ?? '');
      const contentBase64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
      importCustomers.mutate({ data: { fileName: file.name, contentBase64 } }, {
        onSuccess: (importResult) => {
          setResult(importResult);
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          onImported();
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError, 'The workbook could not be imported.')),
      });
    };
    reader.onerror = () => setError('The selected file could not be read in this browser.');
    reader.readAsDataURL(file);
  };

  const downloadSample = async () => {
    setError('');
    setDownloadingSample(true);
    try {
      const response = await fetch('/api/customers/import/template.xlsx', { credentials: 'include' });
      if (!response.ok) throw new Error('The sample workbook could not be downloaded.');
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'hydranet-customer-import-sample.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'The sample workbook could not be downloaded.'));
    } finally {
      setDownloadingSample(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import customer accounts">
      <form onSubmit={submit} className="space-y-5" data-testid="form-import-customers">
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.035] p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-accent/15 p-2.5 text-accent"><FileSpreadsheet size={20} /></div>
            <div>
              <div className="text-sm font-bold">Bring in a workbook</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Existing rows are matched and updated by RADIUS account number.</p>
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-secondary/40">
            <span className="flex min-w-0 items-center gap-2"><UploadCloud size={15} className="shrink-0 text-primary" /><span className="truncate">{file?.name ?? 'Choose .xlsx or .xls file'}</span></span>
            <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-[10px] text-muted-foreground">Browse</span>
            <input data-testid="input-customer-import-file" type="file" accept=".xlsx,.xls" onChange={selectFile} className="sr-only" />
          </label>
        </div>
        <div className="rounded-xl bg-secondary/65 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <span className="font-bold text-foreground">Accepted columns:</span> Customer Name, Mobile Number, RADIUS Account Number, RADIUS Username, Plan.
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
          <div>
            <div className="text-xs font-bold">Need a starting point?</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Download a workbook with the correct headers and one example row.</div>
          </div>
          <Button variant="secondary" onClick={downloadSample} testId="button-download-customer-sample" disabled={downloadingSample}>
            <FileSpreadsheet size={14} /> {downloadingSample ? 'Preparing…' : 'Sample Excel'}
          </Button>
        </div>
        {result && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4" data-testid="import-result">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 size={17} /> Import completed</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-card/80 p-2.5"><div className="mono text-[9px] text-muted-foreground">IMPORTED</div><div className="mt-1 text-lg font-bold text-emerald-700" data-testid="text-imported-count">{result.importedCount}</div></div>
              <div className="rounded-xl bg-card/80 p-2.5"><div className="mono text-[9px] text-muted-foreground">UPDATED</div><div className="mt-1 text-lg font-bold text-primary" data-testid="text-updated-count">{result.updatedCount}</div></div>
              <div className="rounded-xl bg-card/80 p-2.5"><div className="mono text-[9px] text-muted-foreground">FAILED</div><div className="mt-1 text-lg font-bold text-red-700" data-testid="text-failed-count">{result.failedCount}</div></div>
            </div>
            {result.errors.length > 0 && <div className="border-t border-emerald-200 pt-3 text-xs text-red-700"><div className="font-bold">Row-level errors</div><ul className="mt-1 list-disc space-y-1 pl-4">{result.errors.map((item, index) => <li key={`${item}-${index}`} data-testid={`text-import-error-${index}`}>{item}</li>)}</ul></div>}
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="error-import">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} testId="button-cancel-import">Close</Button>
          <Button type="submit" disabled={importCustomers.isPending} testId="button-submit-import">{importCustomers.isPending ? 'Reading workbook…' : 'Import workbook'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function LedgerModal({ customer, canManage, onClose }: { customer: Customer | null; canManage: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const id = customer?.id ?? 0;
  const ledgerQuery = useListCustomerLedger(id, { query: { enabled: Boolean(customer), queryKey: getListCustomerLedgerQueryKey(id) } });
  const createEntry = useCreateCustomerLedgerEntry();
  const [form, setForm] = useState<LedgerForm>(() => emptyLedgerForm());
  const [error, setError] = useState('');

  const openKey = customer ? String(customer.id) : 'closed';
  const [lastOpenKey, setLastOpenKey] = useState('closed');
  useEffect(() => {
    if (openKey !== lastOpenKey) {
      setLastOpenKey(openKey);
      setForm(emptyLedgerForm());
      setError('');
    }
  }, [lastOpenKey, openKey]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !form.entryDate) {
      setError('Enter a positive amount and a valid entry date.');
      return;
    }
    setError('');
    const data: CustomerLedgerInput = {
      entryType: form.entryType,
      amount,
      entryDate: form.entryDate,
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    createEntry.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCustomerLedgerQueryKey(id) });
        setForm(emptyLedgerForm());
      },
      onError: (mutationError) => setError(getErrorMessage(mutationError, 'The ledger entry could not be saved.')),
    });
  };

  const entries: CustomerLedgerEntry[] = ledgerQuery.data ?? [];
  return (
    <Modal open={Boolean(customer)} onClose={onClose} title={customer ? `Ledger · ${customer.name}` : 'Customer ledger'}>
      {customer && <div className="space-y-5" data-testid={`ledger-detail-${customer.id}`}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-3"><div className="mono text-[9px] font-bold uppercase tracking-[0.12em] text-orange-700">Current due</div><div className="mt-2 text-xl font-bold tracking-[-0.04em] text-orange-900" data-testid={`text-due-${customer.id}`}>{formatCurrency(customer.totalDue)}</div></div>
          <div className="rounded-2xl border border-border bg-card p-3"><div className="mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Total debit</div><div className="mt-2 text-lg font-bold" data-testid={`text-debit-${customer.id}`}>{formatCurrency(customer.totalDebit)}</div></div>
          <div className="rounded-2xl border border-border bg-card p-3"><div className="mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Total credit</div><div className="mt-2 text-lg font-bold text-emerald-700" data-testid={`text-credit-${customer.id}`}>{formatCurrency(customer.totalCredit)}</div></div>
        </div>
        {canManage && <form onSubmit={submit} className="rounded-2xl border border-border bg-secondary/35 p-4" data-testid="form-ledger-entry">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold"><CircleDollarSign size={16} className="text-accent" /> Record an entry</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField testId="select-ledger-entry-type" label="Entry type" value={form.entryType} onChange={(value) => setForm({ ...form, entryType: value as CustomerLedgerEntryEntryType })} options={[{ label: 'Debit · add to due', value: CustomerLedgerEntryEntryType.DEBIT }, { label: 'Credit · payment received', value: CustomerLedgerEntryEntryType.CREDIT }]} />
            <Field testId="input-ledger-amount" label="Amount" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} type="number" placeholder="0.00" required />
            <Field testId="input-ledger-date" label="Entry date" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} type="date" required />
            <Field testId="input-ledger-note" label="Note (optional)" value={form.note} onChange={(value) => setForm({ ...form, note: value })} placeholder="Payment reference or service note" />
          </div>
          {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="error-ledger-entry">{error}</div>}
          <div className="mt-3 flex justify-end"><Button type="submit" disabled={createEntry.isPending} testId="button-add-ledger-entry">{createEntry.isPending ? 'Saving entry…' : 'Add entry'}</Button></div>
        </form>}
        <SectionCard title="Ledger history" eyebrow="Server-calculated entries">
          {ledgerQuery.isLoading ? <SkeletonRows count={3} /> : ledgerQuery.isError ? <div className="p-4"><ErrorNotice message="Ledger history is temporarily unavailable." /></div> : entries.length === 0 ? <EmptyState icon={BookOpen} title="No entries yet" description="Debit and credit activity will appear here after the first entry." /> : <div className="divide-y divide-border">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-ledger-${entry.id}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${entry.entryType === 'DEBIT' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}><WalletCards size={15} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-bold"><span>{entry.entryType === 'DEBIT' ? 'Debit' : 'Credit'}</span><span className="text-muted-foreground">· {formatDate(entry.entryDate)}</span></div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.note || 'No note added'}</div></div><div className={`text-sm font-bold ${entry.entryType === 'DEBIT' ? 'text-orange-700' : 'text-emerald-700'}`} data-testid={`text-ledger-amount-${entry.id}`}>{entry.entryType === 'DEBIT' ? '+' : '−'}{formatCurrency(entry.amount)}</div></div>)}</div>}
        </SectionCard>
      </div>}
    </Modal>
  );
}

export function CustomersPage({ user }: { user: User }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | CustomerStatus>('ALL');
  const [customerModal, setCustomerModal] = useState<'create' | Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadingDueReport, setDownloadingDueReport] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const deleteCustomer = useDeleteCustomer();
  const plansQuery = useListPlans();
  const plans = plansQuery.data ?? [];
  const params = useMemo<ListCustomersParams>(() => ({
    search: search.trim() || undefined,
    status: status === 'ALL' ? undefined : status,
  }), [search, status]);
  const customersQuery = useListCustomers(params, { query: { queryKey: getListCustomersQueryKey(params) } });
  const customers = customersQuery.data ?? [];
  const activeCustomers = customers.filter((customer) => customer.status === CustomerStatus.ACTIVE).length;
  const suspendedCustomers = customers.filter((customer) => customer.status === CustomerStatus.SUSPENDED).length;
  const totalDue = customers.reduce((sum, customer) => sum + customer.totalDue, 0);

  const closeCustomerModal = () => setCustomerModal(null);
  const openCreate = () => setCustomerModal('create');
  const openEdit = (customer: Customer) => setCustomerModal(customer);
  const retryCustomers = () => { void customersQuery.refetch(); void plansQuery.refetch(); };
  const removeCustomer = (customer: Customer) => {
    if (!window.confirm(`Delete ${customer.name}? This permanently removes the customer and all ledger entries.`)) return;
    setDeletingCustomerId(customer.id);
    deleteCustomer.mutate({ id: customer.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setDeletingCustomerId(null);
      },
      onError: (error) => {
        setDeletingCustomerId(null);
        window.alert(getErrorMessage(error, 'The customer could not be deleted.'));
      },
    });
  };
  const downloadDueReport = async () => {
    setDownloadingDueReport(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'ALL') query.set('status', status);
      const queryString = query.toString();
      const response = await fetch(`/api/customers/due/export.xlsx${queryString ? `?${queryString}` : ''}`, { credentials: 'include' });
      if (!response.ok) throw new Error('The due report could not be downloaded.');
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'hydranet-customer-due-report.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The due report could not be downloaded.');
    } finally {
      setDownloadingDueReport(false);
    }
  };
  useEffect(() => {
    if (ledgerCustomer) {
      const refreshedCustomer = customers.find((customer) => customer.id === ledgerCustomer.id);
      if (refreshedCustomer && refreshedCustomer !== ledgerCustomer) setLedgerCustomer(refreshedCustomer);
    }
  }, [customers, ledgerCustomer]);

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Subscriber operations"
        title="Customer accounts"
        description="Find the account, verify its RADIUS identity, and keep the server-calculated due in view."
        action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={downloadDueReport} disabled={downloadingDueReport} testId="button-download-due-report"><FileSpreadsheet size={15} /> {downloadingDueReport ? 'Preparing report…' : 'Due report'}</Button>{user.role !== Role.STAFF && <><Button variant="secondary" onClick={() => setImportOpen(true)} testId="button-open-import"><UploadCloud size={15} /> Import Excel</Button><Button onClick={openCreate} testId="button-create-customer"><Plus size={15} /> New customer</Button></>}</div>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId="stat-customers-total" label="Accounts shown" value={String(customers.length)} detail="Matches the current filter" icon={UserRound} accent="blue" />
        <StatCard testId="stat-customers-active" label="Active accounts" value={String(activeCustomers)} detail={`${suspendedCustomers} suspended in this view`} icon={CheckCircle2} accent="green" />
        <StatCard testId="stat-customers-due" label="Total due" value={formatCurrency(totalDue)} detail="Debit less credit, live from server" icon={CircleDollarSign} accent="orange" />
        <StatCard testId="stat-customers-plans" label="Available plans" value={String(plans.filter((plan) => plan.status === 'ACTIVE').length)} detail="Ready for assignment" icon={WalletCards} accent="slate" />
      </div>
      <div className="mt-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="mono text-[10px] uppercase tracking-[0.13em] text-primary">Account register</span>
          {(['ALL', CustomerStatus.ACTIVE, CustomerStatus.SUSPENDED, CustomerStatus.DISCONNECTED] as const).map((value) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${status === value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'}`} data-testid={`button-filter-customer-${value.toLowerCase()}`}>{value === 'ALL' ? 'All' : value.replace('_', ' ')}</button>)}
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="Search name, mobile, RADIUS…" testId="input-search-customers" />
      </div>
      <div className="mt-4">
        <SectionCard title="Customer register" eyebrow="Live account data" action={<span className="mono text-[10px] text-muted-foreground">{customersQuery.isFetching ? 'SYNCING…' : `${customers.length} ROWS`}</span>}>
          {customersQuery.isLoading ? <SkeletonRows count={6} /> : customersQuery.isError ? <div className="p-5"><ErrorNotice message="Customer accounts are temporarily unavailable." /><div className="mt-4"><Button variant="secondary" onClick={retryCustomers} testId="button-retry-customers"><RefreshCw size={14} /> Retry</Button></div></div> : customers.length === 0 ? <EmptyState icon={UserRound} title={search || status !== 'ALL' ? 'No accounts match this view' : 'No customer accounts yet'} description={search || status !== 'ALL' ? 'Try a different search or clear the account filter.' : 'Create an account or import your first workbook to start the register.'} action={!search && status === 'ALL' && user.role !== Role.STAFF ? <Button onClick={openCreate} testId="button-empty-create-customer"><Plus size={15} /> Create customer</Button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-border bg-secondary/35 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="px-5 py-4">Customer</th><th className="px-5 py-4">RADIUS identity</th><th className="px-5 py-4">Assigned plan</th><th className="px-5 py-4">Due</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{customers.map((customer) => <tr key={customer.id} data-testid={`row-customer-${customer.id}`} className="group hover:bg-secondary/25"><td className="px-5 py-4"><div className="font-bold" data-testid={`text-customer-name-${customer.id}`}>{customer.name}</div><div className="mt-1 text-xs text-muted-foreground" data-testid={`text-customer-mobile-${customer.id}`}>{customer.mobileNumber}</div></td><td className="px-5 py-4"><div className="mono text-xs font-bold text-primary" data-testid={`text-radius-account-${customer.id}`}>{customer.radiusAccountNumber}</div><div className="mt-1 text-xs text-muted-foreground" data-testid={`text-radius-username-${customer.id}`}>{customer.username}</div></td><td className="px-5 py-4"><div className="text-sm font-semibold" data-testid={`text-customer-plan-${customer.id}`}>{customer.planName}</div><div className="mt-1 text-[11px] text-muted-foreground">Plan ID {customer.planId}</div></td><td className="px-5 py-4"><div className={`text-sm font-bold ${customer.totalDue > 0 ? 'text-orange-700' : 'text-emerald-700'}`} data-testid={`text-customer-due-${customer.id}`}>{formatCurrency(customer.totalDue)}</div><div className="mt-1 text-[11px] text-muted-foreground">D {formatCurrency(customer.totalDebit)} · C {formatCurrency(customer.totalCredit)}</div></td><td className="px-5 py-4"><StatusPill label={customer.status} tone={toneForCustomerStatus(customer.status)} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100"><button onClick={() => setLedgerCustomer(customer)} data-testid={`button-ledger-customer-${customer.id}`} className="rounded-lg px-2.5 py-2 text-[11px] font-bold text-primary hover:bg-primary/10" aria-label={`Open ledger for ${customer.name}`}>Ledger</button>{user.role !== Role.STAFF && <><button onClick={() => openEdit(customer)} data-testid={`button-edit-customer-${customer.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary" aria-label={`Edit ${customer.name}`}><Pencil size={15} /></button><button onClick={() => removeCustomer(customer)} disabled={deletingCustomerId === customer.id} data-testid={`button-delete-customer-${customer.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50" aria-label={`Delete ${customer.name}`}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </SectionCard>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <SectionCard title="Operational cue" eyebrow="RADIUS verification">
          <div className="flex items-start gap-3 p-5"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><BookOpen size={18} /></div><div><div className="text-sm font-bold">Verify before you change</div><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Use the account number and username together when checking RADIUS. Ledger totals stay server-calculated, so staff always see the same due across the cockpit.</p></div></div>
        </SectionCard>
         <SectionCard title="Import shortcut" eyebrow="Workbook contract">
          <div className="p-5"><div className="flex items-center gap-2 text-xs font-bold"><FileSpreadsheet size={15} className="text-accent" /> Five columns accepted</div><div className="mt-3 flex flex-wrap gap-1.5">{['Customer Name', 'Mobile Number', 'RADIUS Account Number', 'RADIUS Username', 'Plan'].map((label) => <span key={label} className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">{label}</span>)}</div>{user.role !== Role.STAFF && <button onClick={() => setImportOpen(true)} data-testid="button-open-import-secondary" className="mt-4 text-xs font-bold text-primary hover:text-accent">Open import flow →</button>}</div>
        </SectionCard>
      </div>
       <CustomerFormModal open={customerModal !== null} customer={customerModal === 'create' ? null : customerModal} plans={plans} onClose={closeCustomerModal} onSaved={closeCustomerModal} />
       <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => { void queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); }} />
       <LedgerModal customer={ledgerCustomer} canManage={user.role !== Role.STAFF} onClose={() => setLedgerCustomer(null)} />
    </AppShell>
  );
}
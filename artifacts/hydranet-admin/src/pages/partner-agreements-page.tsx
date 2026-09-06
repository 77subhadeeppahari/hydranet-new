import { useState, type FormEvent } from 'react';
import { CheckCircle2, Download, FileSignature, FileUp, Printer, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  downloadPartnerAgreementPdf,
  getListPartnerAgreementsQueryKey,
  PartnerAgreementDocumentType,
  PartnerAgreementInputEntityType,
  useCreatePartnerAgreement,
  useRequestStorageUploadUrl,
} from '@workspace/api-client-react';
import type { PartnerAgreementDetails, PartnerAgreementDocument, User } from '@workspace/api-client-react';
import {
  AppShell,
  ErrorNotice,
  PageHeader,
  SectionCard,
} from '@/components/admin-shell';
import { Button, Field, SelectField } from '@/pages/admin-pages';

type EditableDetails = Record<string, string>;
type EquipmentRow = { name: string; makeModel: string; serialNumber: string };

const emptyDetails: EditableDetails = {
  franchisorPan: '',
  franchiseePan: '',
  authorizedSignatoryAadhaar: '',
  approvedLocation: '',
  termYears: '1',
  terminationNoticeDays: '30',
  initialFranchiseFee: '',
  franchiseeSharePercent: '',
  marketingContributionPercent: '',
  softwareTechnologyFee: '',
  subFranchiseAuthorized: 'false',
  subFranchiseName: '',
  subFranchiseAddress: '',
  subFranchisePan: '',
  subFranchiseAadhaar: '',
  subFranchiseOnboardingFee: '',
  masterFranchiseeSharePercent: '',
  subFranchiseeSharePercent: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankBranchAddress: '',
  equipmentReturnDays: '7',
};

const emptyEquipment = (): EquipmentRow[] =>
  Array.from({ length: 5 }, () => ({ name: '', makeModel: '', serialNumber: '' }));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: string) {
  return value.trim() ? Number(value) : undefined;
}

async function downloadPdf(id: number) {
  const blob = await downloadPartnerAgreementPdf(id);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `hydranet-franchise-agreement-${id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function printPdf(id: number) {
  const blob = await downloadPartnerAgreementPdf(id);
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (printWindow) printWindow.focus();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PartnerAgreementsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const create = useCreatePartnerAgreement();
  const requestUploadUrl = useRequestStorageUploadUrl();
  const [partnerName, setPartnerName] = useState('');
  const [entityType, setEntityType] = useState<PartnerAgreementInputEntityType>(PartnerAgreementInputEntityType.Proprietorship);
  const [businessAddress, setBusinessAddress] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [agreementDate, setAgreementDate] = useState(today());
  const [details, setDetails] = useState<EditableDetails>(emptyDetails);
  const [equipment, setEquipment] = useState<EquipmentRow[]>(emptyEquipment);
  const [documents, setDocuments] = useState<PartnerAgreementDocument[]>([]);
  const [uploadingType, setUploadingType] = useState<PartnerAgreementDocumentType | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [savedCode, setSavedCode] = useState('');
  const [error, setError] = useState('');

  const updateDetail = (key: string, value: string) => setDetails((current) => ({ ...current, [key]: value }));
  const updateEquipment = (index: number, key: keyof EquipmentRow, value: string) => {
    setEquipment((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };

  const uploadDocument = async (type: PartnerAgreementDocumentType, file?: File) => {
    if (!file) return;
    setError('');
    setUploadingType(type);
    try {
      const upload = await requestUploadUrl.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
        },
      });
      const uploaded = await fetch(upload.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploaded.ok) throw new Error('The document upload could not be completed.');
      setDocuments((current) => [
        ...current.filter((document) => document.type !== type),
        { type, name: file.name, objectPath: upload.objectPath, size: file.size, contentType: file.type || 'application/octet-stream' },
      ]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The document could not be uploaded.');
    } finally {
      setUploadingType(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const formData: PartnerAgreementDetails = {
      franchisorPan: details.franchisorPan || undefined,
      franchiseePan: details.franchiseePan || undefined,
      authorizedSignatoryAadhaar: details.authorizedSignatoryAadhaar || undefined,
      approvedLocation: details.approvedLocation || undefined,
      termYears: numberValue(details.termYears),
      terminationNoticeDays: numberValue(details.terminationNoticeDays),
      initialFranchiseFee: numberValue(details.initialFranchiseFee),
      franchiseeSharePercent: numberValue(details.franchiseeSharePercent),
      marketingContributionPercent: numberValue(details.marketingContributionPercent),
      softwareTechnologyFee: numberValue(details.softwareTechnologyFee),
      subFranchiseAuthorized: details.subFranchiseAuthorized === 'true',
      subFranchiseName: details.subFranchiseName || undefined,
      subFranchiseAddress: details.subFranchiseAddress || undefined,
      subFranchisePan: details.subFranchisePan || undefined,
      subFranchiseAadhaar: details.subFranchiseAadhaar || undefined,
      subFranchiseOnboardingFee: numberValue(details.subFranchiseOnboardingFee),
      masterFranchiseeSharePercent: numberValue(details.masterFranchiseeSharePercent),
      subFranchiseeSharePercent: numberValue(details.subFranchiseeSharePercent),
      bankAccountName: details.bankAccountName || undefined,
      bankName: details.bankName || undefined,
      bankAccountNumber: details.bankAccountNumber || undefined,
      bankIfsc: details.bankIfsc || undefined,
      bankBranchAddress: details.bankBranchAddress || undefined,
      equipmentReturnDays: numberValue(details.equipmentReturnDays),
      equipment: equipment.filter((row) => row.name || row.makeModel || row.serialNumber),
    };
    create.mutate({
      data: {
        partnerName: partnerName.trim(),
        entityType,
        businessAddress: businessAddress.trim(),
        mobileNumber: mobileNumber.trim(),
        email: email.trim() || undefined,
        agreementDate,
        formData,
        documents,
      },
    }, {
      onSuccess: (agreement) => {
        setSavedId(agreement.id);
        setSavedCode(agreement.partnerCode);
        queryClient.invalidateQueries({ queryKey: getListPartnerAgreementsQueryKey() });
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'The partner registration could not be saved.'),
    });
  };

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Network growth"
        title="Create partner agreement"
        description="Register a partner, upload their verification documents, and generate the completed Hydranet agreement from the approved 10-page template."
        action={savedId ? <div className="flex gap-2"><Button variant="secondary" onClick={() => printPdf(savedId)} testId="button-print-latest-agreement"><Printer size={15} /> Print PDF</Button><Button onClick={() => downloadPdf(savedId)} testId="button-download-latest-agreement"><Download size={15} /> Download PDF</Button></div> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-6">
          {error && <ErrorNotice message={error} />}
          {savedId && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><ShieldCheck size={18} /><span>Registration saved with partner code <strong>{savedCode}</strong>. The agreement is ready to print or download.</span><Button onClick={() => printPdf(savedId)} variant="secondary" testId="button-print-saved-agreement"><Printer size={14} /> Print PDF</Button></div>}

          <SectionCard eyebrow="01 · Agreement parties" title="Partner registration details">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Partner / franchisee name" value={partnerName} onChange={setPartnerName} required testId="input-partner-name" />
              <SelectField label="Business constitution" value={entityType} onChange={(value) => setEntityType(value as PartnerAgreementInputEntityType)} options={Object.values(PartnerAgreementInputEntityType).map((value) => ({ label: value, value }))} testId="select-partner-entity" />
              <Field label="Mobile number" value={mobileNumber} onChange={setMobileNumber} required testId="input-partner-mobile" />
              <Field label="Email address" value={email} onChange={setEmail} type="email" testId="input-partner-email" />
              <Field label="Principal place of business" value={businessAddress} onChange={setBusinessAddress} required testId="input-partner-address" />
              <Field label="Agreement execution date" value={agreementDate} onChange={setAgreementDate} type="date" required testId="input-agreement-date" />
              <Field label="Company PAN" value={details.franchisorPan} onChange={(value) => updateDetail('franchisorPan', value)} testId="input-franchisor-pan" />
              <Field label="Franchisee PAN" value={details.franchiseePan} onChange={(value) => updateDetail('franchiseePan', value)} testId="input-franchisee-pan" />
              <Field label="Authorized signatory Aadhaar (redacted)" value={details.authorizedSignatoryAadhaar} onChange={(value) => updateDetail('authorizedSignatoryAadhaar', value)} testId="input-signatory-aadhaar" />
              <Field label="Approved franchise location" value={details.approvedLocation} onChange={(value) => updateDetail('approvedLocation', value)} testId="input-approved-location" />
            </div>
          </SectionCard>

          <SectionCard eyebrow="02 · Commercial terms" title="Term, revenue share, and fees">
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Agreement term (years)" value={details.termYears} onChange={(value) => updateDetail('termYears', value)} type="number" testId="input-term-years" />
              <Field label="Termination notice (days)" value={details.terminationNoticeDays} onChange={(value) => updateDetail('terminationNoticeDays', value)} type="number" testId="input-notice-days" />
              <Field label="Initial franchise fee (INR)" value={details.initialFranchiseFee} onChange={(value) => updateDetail('initialFranchiseFee', value)} type="number" testId="input-initial-fee" />
              <Field label="Franchisee share (%)" value={details.franchiseeSharePercent} onChange={(value) => updateDetail('franchiseeSharePercent', value)} type="number" testId="input-franchisee-share" />
              <Field label="Marketing contribution (%)" value={details.marketingContributionPercent} onChange={(value) => updateDetail('marketingContributionPercent', value)} type="number" testId="input-marketing-share" />
              <Field label="Software / technology fee (INR)" value={details.softwareTechnologyFee} onChange={(value) => updateDetail('softwareTechnologyFee', value)} type="number" testId="input-technology-fee" />
            </div>
          </SectionCard>

          <SectionCard eyebrow="03 · Sub-franchise" title="Sub-franchise rights and details">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <SelectField label="Sub-franchise authority" value={details.subFranchiseAuthorized} onChange={(value) => updateDetail('subFranchiseAuthorized', value)} options={[{ label: 'Not authorized', value: 'false' }, { label: 'Authorized', value: 'true' }]} testId="select-sub-franchise-authority" />
              <Field label="Sub-franchisee name" value={details.subFranchiseName} onChange={(value) => updateDetail('subFranchiseName', value)} testId="input-sub-franchise-name" />
              <Field label="Sub-franchisee address" value={details.subFranchiseAddress} onChange={(value) => updateDetail('subFranchiseAddress', value)} testId="input-sub-franchise-address" />
              <Field label="Sub-franchisee PAN" value={details.subFranchisePan} onChange={(value) => updateDetail('subFranchisePan', value)} testId="input-sub-franchise-pan" />
              <Field label="Sub-franchisee Aadhaar (redacted)" value={details.subFranchiseAadhaar} onChange={(value) => updateDetail('subFranchiseAadhaar', value)} testId="input-sub-franchise-aadhaar" />
              <Field label="Sub-franchise onboarding fee (INR)" value={details.subFranchiseOnboardingFee} onChange={(value) => updateDetail('subFranchiseOnboardingFee', value)} type="number" testId="input-sub-franchise-fee" />
              <Field label="Master franchisee share (%)" value={details.masterFranchiseeSharePercent} onChange={(value) => updateDetail('masterFranchiseeSharePercent', value)} type="number" testId="input-master-share" />
              <Field label="Sub-franchisee share (%)" value={details.subFranchiseeSharePercent} onChange={(value) => updateDetail('subFranchiseeSharePercent', value)} type="number" testId="input-sub-share" />
            </div>
          </SectionCard>

          <SectionCard eyebrow="04 · Remittances" title="Franchisee bank account">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Account name" value={details.bankAccountName} onChange={(value) => updateDetail('bankAccountName', value)} testId="input-bank-account-name" />
              <Field label="Bank name" value={details.bankName} onChange={(value) => updateDetail('bankName', value)} testId="input-bank-name" />
              <Field label="Account number" value={details.bankAccountNumber} onChange={(value) => updateDetail('bankAccountNumber', value)} testId="input-bank-account-number" />
              <Field label="IFSC code" value={details.bankIfsc} onChange={(value) => updateDetail('bankIfsc', value)} testId="input-bank-ifsc" />
              <Field label="Branch address" value={details.bankBranchAddress} onChange={(value) => updateDetail('bankBranchAddress', value)} testId="input-bank-branch" />
            </div>
          </SectionCard>

          <SectionCard eyebrow="05 · Equipment" title="Provided equipment list">
            <div className="space-y-3 p-5">
              <Field label="Return equipment within (days)" value={details.equipmentReturnDays} onChange={(value) => updateDetail('equipmentReturnDays', value)} type="number" testId="input-equipment-return-days" />
              {equipment.map((row, index) => <div key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label={`Item ${index + 1} · equipment name`} value={row.name} onChange={(value) => updateEquipment(index, 'name', value)} testId={`input-equipment-name-${index + 1}`} />
                <Field label="Make / model" value={row.makeModel} onChange={(value) => updateEquipment(index, 'makeModel', value)} testId={`input-equipment-model-${index + 1}`} />
                <Field label="Type / serial no." value={row.serialNumber} onChange={(value) => updateEquipment(index, 'serialNumber', value)} testId={`input-equipment-serial-${index + 1}`} />
                <button type="button" className="mt-6 self-start rounded-xl p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600" onClick={() => updateEquipment(index, 'name', '')} aria-label={`Clear equipment row ${index + 1}`} data-testid={`button-clear-equipment-${index + 1}`}><Trash2 size={15} /></button>
              </div>)}
            </div>
          </SectionCard>

          <SectionCard eyebrow="06 · Verification documents" title="Partner document uploads">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {([
                [PartnerAgreementDocumentType.trade_license, 'Trade licence'],
                [PartnerAgreementDocumentType.pan, 'PAN card'],
                [PartnerAgreementDocumentType.aadhaar, 'Aadhaar card'],
                [PartnerAgreementDocumentType.bank_statement, 'Bank statement'],
                [PartnerAgreementDocumentType.cancelled_cheque, 'Cancelled cheque'],
              ] as const).map(([type, label]) => {
                const uploaded = documents.find((document) => document.type === type);
                return <label key={type} className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 p-4 transition-colors hover:border-primary hover:bg-primary/5">
                  <input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { void uploadDocument(type, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">{uploaded ? <CheckCircle2 size={19} className="text-emerald-600" /> : <UploadCloud size={19} />}</span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{uploadingType === type ? 'Uploading…' : uploaded ? uploaded.name : 'PDF, JPG or PNG · click to upload'}</span></span>
                  <FileUp size={15} className="ml-auto shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </label>;
              })}
            </div>
          </SectionCard>

          <Button type="submit" disabled={create.isPending || Boolean(uploadingType)} testId="button-create-partner-agreement"><FileSignature size={16} /> {create.isPending ? 'Creating agreement…' : 'Create registration & agreement PDF'}</Button>
        </form>
      </div>
    </AppShell>
  );
}
import { writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, partnerAgreementsTable } from '@workspace/db';
import { buildAgreementPdf } from '../../artifacts/api-server/src/routes/partner-agreements';

async function main() {
  const [row] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, 3));
  if (!row) throw new Error('Partner agreement 3 was not found');
  await writeFile('../../.agents/outputs/fixed-partner-agreement.pdf', await buildAgreementPdf(row));
  console.log('generated', row.id, row.partnerName);
}

void main();

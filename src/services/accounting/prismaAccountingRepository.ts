import { prisma } from '../database/prisma';
import type { AccountingRepository, JournalEntryInput, LedgerAccountType } from '../../modules/accounting/contracts';

export class PrismaAccountingRepository implements AccountingRepository {
  async ensureAccount(code: string, name: string, type: LedgerAccountType) {
    await prisma.ledgerAccount.upsert({
      where: { code },
      update: { name, type },
      create: { code, name, type },
    });
  }

  async postJournalEntry(input: JournalEntryInput) {
    const entry = await prisma.journalEntry.create({
      data: {
        reference: input.reference,
        memo: input.memo,
        currency: input.currency || 'USD',
        lines: {
          create: await Promise.all(
            input.lines.map(async (line) => {
              const account = await prisma.ledgerAccount.findUnique({
                where: { code: line.accountCode },
              });

              if (!account) {
                throw new Error(`Account ${line.accountCode} does not exist`);
              }

              return {
                accountId: account.id,
                debit: line.debit ?? 0,
                credit: line.credit ?? 0,
                description: line.description,
              };
            }),
          ),
        },
      },
    });

    return {
      id: entry.id,
      reference: entry.reference,
    };
  }
}

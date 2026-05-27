import { describe, expect, it } from 'vitest';
import { createAccountingModule } from '@/src/modules/accounting/application';

describe('accounting module', () => {
  it('rejects unbalanced journal entries', async () => {
    const accounting = createAccountingModule({
      repository: {
        ensureAccount: async () => undefined,
        postJournalEntry: async () => ({ id: '1', reference: 'ref-1' }),
      },
    });

    await expect(
      accounting.postJournalEntry({
        reference: 'INV-100',
        lines: [
          { accountCode: '1000', debit: 100 },
          { accountCode: '4000', credit: 90 },
        ],
      }),
    ).rejects.toThrow('Journal entry must be balanced');
  });
});

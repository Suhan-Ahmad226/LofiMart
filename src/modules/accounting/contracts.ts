export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type JournalLineInput = {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
};

export type JournalEntryInput = {
  reference: string;
  memo?: string;
  currency?: string;
  lines: JournalLineInput[];
};

export interface AccountingRepository {
  ensureAccount(code: string, name: string, type: LedgerAccountType): Promise<void>;
  postJournalEntry(input: JournalEntryInput): Promise<{ id: string; reference: string }>;
}

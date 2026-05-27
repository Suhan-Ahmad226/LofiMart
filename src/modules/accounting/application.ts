import type { AccountingRepository, JournalEntryInput } from './contracts';

function validateBalancedEntry(entry: JournalEntryInput) {
  const debit = entry.lines.reduce((total, line) => total + (line.debit ?? 0), 0);
  const credit = entry.lines.reduce((total, line) => total + (line.credit ?? 0), 0);

  if (debit <= 0 || credit <= 0 || debit !== credit) {
    throw new Error('Journal entry must be balanced');
  }
}

export function createAccountingModule(dependencies: { repository: AccountingRepository }) {
  const { repository } = dependencies;

  return {
    async ensureDefaultChartOfAccounts() {
      await repository.ensureAccount('1000', 'Cash', 'asset');
      await repository.ensureAccount('1010', 'Stripe Clearing', 'asset');
      await repository.ensureAccount('1100', 'Accounts Receivable', 'asset');
      await repository.ensureAccount('2000', 'Accounts Payable', 'liability');
      await repository.ensureAccount('2100', 'Customer Wallet Liability', 'liability');
      await repository.ensureAccount('2200', 'Seller Payout Payable', 'liability');
      await repository.ensureAccount('2210', 'Reseller Payout Payable', 'liability');
      await repository.ensureAccount('4000', 'Product Revenue', 'revenue');
      await repository.ensureAccount('4050', 'Sales Returns and Refunds', 'expense');
      await repository.ensureAccount('4200', 'Wallet Adjustment Recovery', 'revenue');
      await repository.ensureAccount('5000', 'Cost of Goods Sold', 'expense');
      await repository.ensureAccount('6100', 'Wallet Adjustment Expense', 'expense');
      await repository.ensureAccount('6200', 'Partner Settlement Expense', 'expense');
    },

    async postJournalEntry(entry: JournalEntryInput) {
      validateBalancedEntry(entry);
      return repository.postJournalEntry(entry);
    },
  };
}

import { createAccountingModule } from './application';
import { PrismaAccountingRepository } from '../../features/admin/services/accounting/prismaAccountingRepository';

export const accountingModule = createAccountingModule({
  repository: new PrismaAccountingRepository(),
});

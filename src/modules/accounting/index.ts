import { createAccountingModule } from './application';
import { PrismaAccountingRepository } from '../../services/accounting/prismaAccountingRepository';

export const accountingModule = createAccountingModule({
  repository: new PrismaAccountingRepository(),
});

export type BkashGrantTokenResponse = {
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
};

export type BkashCreatePaymentRequest = {
  mode: '0001';
  payerReference: string;
  callbackURL: string;
  amount: string;
  currency: 'BDT';
  intent: 'sale';
  merchantInvoiceNumber: string;
  agreementID: string;
  merchantAssociationInfo?: string;
};

export type BkashCreatePaymentResponse = {
  paymentID: string;
  bkashURL?: string;
  callbackURL?: string;
  successCallbackURL?: string;
  failureCallbackURL?: string;
  cancelledCallbackURL?: string;
  amount?: string;
  currency?: string;
  intent?: string;
  merchantInvoiceNumber?: string;
  statusCode: string;
  statusMessage: string;
};

export type BkashExecutePaymentResponse = {
  paymentID: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  intent?: string;
  merchantInvoiceNumber?: string;
  paymentExecuteTime?: string;
  statusCode: string;
  statusMessage: string;
};

export type BkashQueryPaymentResponse = {
  paymentID: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  intent?: string;
  merchantInvoiceNumber?: string;
  paymentExecuteTime?: string;
  statusCode: string;
  statusMessage: string;
};

export type BkashTokenCache = {
  idToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number;
};

export type BkashCallbackStatus = 'success' | 'failure' | 'cancel';

export type BkashCallbackQuery = {
  paymentID: string;
  status: BkashCallbackStatus;
  signature?: string;
};

export type BkashVerificationResult = {
  paymentId: string;
  orderId: string | null;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'cancelled';
  trxId: string | null;
  rawStatus: string | null;
  amount: number | null;
  verified: boolean;
};

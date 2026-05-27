// These tokenized checkout paths follow the official bKash tokenized checkout examples.
export const BKASH_TOKEN_GRANT_PATH = '/tokenized/checkout/token/grant';
export const BKASH_TOKEN_REFRESH_PATH = '/tokenized/checkout/token/refresh';
export const BKASH_CREATE_PAYMENT_PATH = '/tokenized/checkout/create';
export const BKASH_EXECUTE_PAYMENT_PATH = '/tokenized/checkout/execute';
export const BKASH_QUERY_PAYMENT_PATH = '/tokenized/checkout/payment/status';

export const BKASH_TOKEN_CACHE_KEY = 'payments:bkash:tokenized:token';
export const BKASH_TOKEN_SKEW_MS = 60_000;

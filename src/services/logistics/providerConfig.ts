import { getServerEnv } from '../../lib/env';

export function getCourierProviderSetupStatus(code: string) {
  const env = getServerEnv();
  const normalizedCode = String(code || '').toLowerCase();

  if (normalizedCode === 'pathao') {
    const configured = Boolean(
      env.PATHAO_CLIENT_ID &&
      env.PATHAO_CLIENT_SECRET &&
      env.PATHAO_BASE_URL &&
      env.PATHAO_USERNAME &&
      env.PATHAO_PASSWORD,
    );
    return configured
      ? {
          setupStatus: 'api_ready' as const,
          setupMessage: 'Pathao OAuth, merchant account, and direct booking configuration are ready.',
        }
      : {
          setupStatus: 'missing_config' as const,
          setupMessage: 'Add Pathao client, merchant username/password, and base URL to enable direct API booking.',
        };
  }

  if (normalizedCode === 'redx') {
    const configured = Boolean(
      env.REDX_API_KEY &&
      env.REDX_SECRET_KEY &&
      env.REDX_BASE_URL &&
      env.REDX_BOOKING_ENDPOINT,
    );
    return configured
      ? {
          setupStatus: 'api_ready' as const,
          setupMessage: 'RedX API credentials and booking endpoint are configured for direct shipment booking.',
        }
      : {
          setupStatus: 'missing_config' as const,
          setupMessage: 'Add RedX credentials and REDX_BOOKING_ENDPOINT to enable direct API booking.',
        };
  }

  if (normalizedCode === 'steadfast') {
    const configured = Boolean(
      env.STEADFAST_API_KEY &&
      env.STEADFAST_SECRET_KEY &&
      env.STEADFAST_BASE_URL,
    );

    if (configured) {
      return {
        setupStatus: 'api_ready' as const,
        setupMessage: 'Steadfast API headers, base URL, and direct shipment booking are configured.',
      };
    }

    return {
      setupStatus: 'manual_ready' as const,
      setupMessage: 'Steadfast supports the production-safe manual workflow. Add API key, secret key, and base URL to enable direct booking and sync.',
    };
  }

  return {
    setupStatus: 'manual_ready' as const,
    setupMessage: 'This provider currently operates through the manual booking workflow.',
  };
}

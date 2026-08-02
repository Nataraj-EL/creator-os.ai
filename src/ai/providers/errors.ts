export type ProviderErrorCode = 'TIMEOUT' | 'CANCELLED' | 'RATE_LIMIT' | 'AUTH_ERROR' | 'BAD_REQUEST' | 'UNKNOWN';

export class ProviderError extends Error {
  constructor(
    message: string,
    public providerName: string,
    public code: ProviderErrorCode,
    public originalError?: any
  ) {
    super(`[Provider: ${providerName}] ${message}`);
    this.name = 'ProviderError';
    
    // Maintain stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }
}

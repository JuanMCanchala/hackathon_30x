/** Thin HTTP client for Mandato's agent gateway (/agent/v1). */

export class MandatoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MandatoClientOptions {
  baseUrl: string;
  agentKey: string;
  fetch?: typeof fetch;
}

export class MandatoClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: MandatoClientOptions) {
    this.fetcher = options.fetch ?? fetch;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.options.agentKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!response.ok) {
      throw new MandatoError(
        response.status,
        body.error?.message ?? `Mandato respondió ${response.status}`,
      );
    }
    return body;
  }

  requestPayment(payload: unknown) {
    return this.call<Record<string, unknown>>('/agent/v1/payment-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getPaymentRequest(id: string) {
    return this.call<Record<string, unknown>>(
      `/agent/v1/payment-requests/${encodeURIComponent(id)}`,
    );
  }

  budget() {
    return this.call<Record<string, unknown>>('/agent/v1/budget');
  }

  payees() {
    return this.call<Record<string, unknown>[]>('/agent/v1/payees');
  }
}

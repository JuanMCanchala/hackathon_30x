/**
 * A minimal HTTP client on node:https. Unlike `fetch`, it sends only the headers we pass:
 * Instagram rejects the sec-fetch-* headers that undici adds ("SecFetch Policy violation").
 * Everything that reads the network takes a `Fetcher`, so tests pass a fake one instead.
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

export const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const INSTAGRAM_APP_UA =
  'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; es_US; 541635890)';
export const INSTAGRAM_APP_ID = '567067343352427';

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** The final URL, after redirects. */
  url: string;
  body: string;
}

export type Fetcher = (url: string, init?: HttpRequest) => Promise<HttpResponse>;

const MAX_BYTES = 25 * 1024 * 1024;

function decode(buffer: Buffer, encoding: string | undefined): Buffer {
  switch (encoding) {
    case 'gzip':
      return gunzipSync(buffer);
    case 'br':
      return brotliDecompressSync(buffer);
    case 'deflate':
      return inflateSync(buffer);
    default:
      return buffer;
  }
}

function send(url: string, init: HttpRequest, hops: number): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = target.protocol === 'http:' ? httpRequest : httpsRequest;
    const headers: Record<string, string> = { 'user-agent': BROWSER_UA, ...init.headers };
    if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body));
    const req = request(
      target,
      { method: init.method ?? 'GET', headers, timeout: init.timeoutMs ?? 30_000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && hops > 0) {
          res.resume();
          // A redirect after a POST is followed as a GET, as browsers do.
          const next = new URL(location, target).toString();
          resolve(send(next, { ...init, method: 'GET', body: undefined }, hops - 1));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) req.destroy(new Error('response too large'));
          else chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            const body = decode(Buffer.concat(chunks), res.headers['content-encoding']);
            resolve({ status, url: target.toString(), body: body.toString('utf8') });
          } catch (error) {
            reject(error);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout after ${init.timeoutMs ?? 30_000} ms`)));
    req.on('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/** GET or POST, following up to five redirects. Network errors reject; HTTP errors resolve. */
export const httpFetch: Fetcher = (url, init = {}) => send(url, init, 5);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

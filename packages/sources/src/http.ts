/**
 * A minimal HTTP client on node:https. Unlike `fetch`, it sends only the headers we pass:
 * Instagram rejects the sec-fetch-* headers that undici adds ("SecFetch Policy violation").
 * Everything that reads the network takes a `Fetcher`, so tests pass a fake one instead.
 *
 * Some URLs come from users (the community sensor), so every hop, the first URL and each
 * redirect, must be https to a public host: no loopback, private network or cloud metadata.
 */
import type { LookupAddress, LookupOptions } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
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

// BlockList also matches IPv4-mapped IPv6 (::ffff:10.0.0.1) against the IPv4 subnets.
const internal = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3], // multicast, reserved and broadcast
] as const)
  internal.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  internal.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local, CGNAT and other addresses that are not the internet. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || internal.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const refuse = (what: string) => new Error(`refused: ${what} is not a public https URL`);

/** Parses a hop and throws unless it is https to a public name or address. */
export function checkUrl(url: string | URL): URL {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw refuse(target.protocol);
  const host = target.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (/(^|\.)(localhost|internal|local)$/.test(host)) throw refuse(host);
  if (isIP(host) && isPrivateAddress(host)) throw refuse(host);
  return target;
}

export type Resolver = (hostname: string, options: LookupOptions) => Promise<LookupAddress[]>;

/**
 * A socket `lookup` that refuses a name if any of its addresses is private. The connection then
 * uses the addresses checked here, so a name cannot resolve public for us and private for it.
 */
export function publicLookup(
  resolve: Resolver = (hostname, options) => dnsLookup(hostname, { ...options, all: true }),
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, options).then(
      (addresses) => {
        const bad = addresses.find((a) => isPrivateAddress(a.address));
        if (bad || addresses.length === 0) callback(refuse(bad?.address ?? hostname), '', 0);
        else if (options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, '', 0),
    );
  };
}

const lookup = publicLookup();

/** The next hop of a redirect. Throws a plain error on a Location that is not a URL. */
export function redirectTarget(location: string, current: URL): string {
  try {
    return new URL(location, current).toString();
  } catch {
    throw new Error(`redirect to an invalid URL: ${location.slice(0, 200)}`);
  }
}

function send(url: string, init: HttpRequest, hops: number): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    // Every hop goes through here, redirects included, so each one is checked.
    const target = checkUrl(url);
    const headers: Record<string, string> = { 'user-agent': BROWSER_UA, ...init.headers };
    if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body));
    const req = httpsRequest(
      target,
      { method: init.method ?? 'GET', headers, timeout: init.timeoutMs ?? 30_000, lookup },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && hops > 0) {
          res.resume();
          // Inside this callback a throw would escape the promise and take the process down.
          let next: string;
          try {
            next = redirectTarget(location, target);
          } catch (error) {
            reject(error);
            return;
          }
          // A redirect after a POST is followed as a GET, as browsers do.
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

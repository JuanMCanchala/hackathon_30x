import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import { checkUrl, httpFetch, isPrivateAddress, publicLookup, redirectTarget } from '../src/http';

describe('isPrivateAddress', () => {
  it.each([
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
  ])('%s is private', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111'])('%s is public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('checkUrl', () => {
  it('lets public https URLs through', () => {
    expect(checkUrl('https://www.linkedin.com/posts/x').hostname).toBe('www.linkedin.com');
    expect(checkUrl('https://8.8.8.8/').hostname).toBe('8.8.8.8');
  });

  it.each([
    'http://www.linkedin.com/posts/x',
    'ftp://example.com/',
    'https://localhost/',
    'https://api.localhost/',
    'https://metadata.google.internal/',
    'https://localhost./',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/',
    'https://[::ffff:10.0.0.1]/',
    'https://[fe80::1]/',
  ])('refuses %s', (url) => expect(() => checkUrl(url)).toThrow(/refused/));
});

describe('httpFetch', () => {
  it('refuses a non-https or internal first hop before connecting', async () => {
    await expect(httpFetch('http://example.com/')).rejects.toThrow(/refused/);
    await expect(httpFetch('https://127.0.0.1:1/')).rejects.toThrow(/refused/);
  });
});

describe('publicLookup', () => {
  const resolver = (addresses: LookupAddress[]) => async (): Promise<LookupAddress[]> => addresses;
  const run = (addresses: LookupAddress[], all: boolean) =>
    new Promise<unknown>((resolve, reject) =>
      publicLookup(resolver(addresses))('example.test', { all }, (error, address, family) =>
        error ? reject(error) : resolve(all ? address : [address, family]),
      ),
    );

  it('refuses a name when any of its addresses is private', async () => {
    const mixed = [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(run(mixed, true)).rejects.toThrow(/refused/);
    await expect(run(mixed, false)).rejects.toThrow(/refused/);
  });

  it('answers in the shape the caller asked for when every address is public', async () => {
    const pub = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ];
    expect(await run(pub, true)).toEqual(pub);
    expect(await run(pub, false)).toEqual(['93.184.216.34', 4]);
  });
});

describe('redirectTarget', () => {
  it('resolves a relative Location against the current hop', () => {
    expect(redirectTarget('/next?a=1', new URL('https://bsky.app/profile/x'))).toBe(
      'https://bsky.app/next?a=1',
    );
  });

  it('rejects a malformed Location instead of throwing out of the response callback', () => {
    expect(() => redirectTarget('https://[', new URL('https://bsky.app/'))).toThrow(
      'redirect to an invalid URL',
    );
  });
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { getDS, parseCookie, normalizeCookie, splitCookies } from '../src/MYS/index.js'

test('parseCookie parses mihoyo cookie into key/value pairs', () => {
  const cookie = '_MHYUUID=abc; ltuid_v2=425433597; cookie_token_v2=v2_xxx; ltmid_v2=0ch0yy1z3v_mhy'
  const fields = parseCookie(cookie)
  assert.equal(fields.get('_MHYUUID'), 'abc')
  assert.equal(fields.get('ltuid_v2'), '425433597')
  assert.equal(fields.get('cookie_token_v2'), 'v2_xxx')
  assert.equal(fields.get('ltmid_v2'), '0ch0yy1z3v_mhy')
})

test('getDS returns timestamp,nonce,md5 signature', () => {
  const ds = getDS()
  assert.match(ds, /^\d{10},[a-z0-9]{1,6},[a-f0-9]{32}$/)
})

test('normalizeCookie accepts a copied "Cookie:" header line', () => {
  assert.equal(
    normalizeCookie('  Cookie: ltuid_v2=1; cookie_token_v2=v2_x;  '),
    'ltuid_v2=1; cookie_token_v2=v2_x;'
  )
  assert.equal(normalizeCookie('"ltuid_v2=1; cookie_token_v2=v2_x"'), 'ltuid_v2=1; cookie_token_v2=v2_x')
})

test('splitCookies accepts English comma, Chinese comma and newlines', () => {
  assert.deepEqual(splitCookies('a=1,b=2'), ['a=1', 'b=2'])
  assert.deepEqual(splitCookies('a=1，b=2'), ['a=1', 'b=2'])
  assert.deepEqual(splitCookies('a=1\nb=2\r\nc=3'), ['a=1', 'b=2', 'c=3'])
})

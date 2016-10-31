import { execFileSync, spawnSync } from 'child_process'
import { randomBytes } from 'crypto'
import { join, resolve } from 'path'

import test from 'ava'
import md5hex from 'md5-hex'
import proxyquire from 'proxyquire'

import { sync } from '../'
import { files, diffs } from './fixtures/index.json'

function bytes (base64) {
  if (typeof base64 === 'undefined') return null

  return new Buffer(base64, 'base64')
}

let ownHash = null
test.serial('hashes itself', t => {
  const result = sync(resolve('..'))
  t.true(typeof result === 'string')
  t.true(result.length > 0)
  ownHash = new Buffer(result, 'hex')
})

test('throws when called with a directory that is not an installed package', t => {
  const err = t.throws(() => sync(resolve('fixtures', 'not-a-package')))
  t.is(err.code, 'ENOENT')
})

test('throws when called with a non-existent path', t => {
  const err = t.throws(() => sync(resolve('fixtures', 'does-not-exist')))
  t.is(err.code, 'ENOENT')
})

test('can be called with a directory', t => {
  const dir = resolve('fixtures', 'unpacked', 'just-a-package')
  const actual = sync(dir)
  const expected = md5hex([
    ownHash,
    dir,
    bytes(files['just-a-package']['package.json'])
  ])

  t.true(actual === expected)
})

test('can be called with a file', t => {
  const dir = resolve('fixtures', 'unpacked', 'just-a-package')
  const file = join(dir, 'package.json')
  const actual = sync(file)
  const expected = md5hex([
    ownHash,
    dir,
    bytes(files['just-a-package']['package.json'])
  ])

  t.true(actual === expected)
})

;[
  ['null', null],
  ['a number', 42],
  ['a boolean', false],
  ['a function', () => {}]
].forEach(([label, salt]) => {
  test(`salt cannot be ${label}`, t => {
    const err = t.throws(() => sync(resolve('..'), salt), TypeError)
    t.is(err.message, 'Salt must be an Array, Buffer, Object or string')
  })
})

;[
  ['can be a Buffer', randomBytes(16)],
  ['can be an Array', [{foo: 'bar'}, 'baz'], JSON.stringify([{foo: 'bar'}, 'baz'])],
  ['can be an Object', {foo: 'bar'}, JSON.stringify({foo: 'bar'})],
  ['can be a string', 'foobar'],
  ['is ignored when undefined', undefined, '']
].forEach(([label, salt, stringifiedSalt = salt]) => {
  test(`salt ${label}`, t => {
    const dir = resolve('fixtures', 'unpacked', 'just-a-package')
    const file = join(dir, 'package.json')
    const actual = sync(file, salt)
    const expected = md5hex([
      ownHash,
      stringifiedSalt,
      dir,
      bytes(files['just-a-package']['package.json'])
    ])

    t.true(actual === expected)
  })
})

test('can be called with a list of directories or files', t => {
  const salt = randomBytes(16)
  const dir = resolve('fixtures', 'unpacked', 'head-is-a-commit')
  const dir2 = resolve('fixtures', 'unpacked', 'just-a-package')
  const file = join(dir2, 'package.json')

  const actual = sync([dir, file], salt)
  const expected = md5hex([
    ownHash,
    salt,
    dir,
    bytes(files['head-is-a-commit']['package.json']),
    bytes(files['head-is-a-commit']['.git/HEAD']),
    dir2,
    bytes(files['just-a-package']['package.json'])
  ])

  t.true(actual === expected)
})

;[
  'dirty-repo',
  'fake-repo-parent/fake-repo',
  'head-is-a-commit',
  'head-is-a-ref',
  'repo-with-packed-refs',
  'repo-without-refs'
].forEach(fixture => {
  test(`${fixture} is hashed correctly`, t => {
    const dir = resolve('fixtures', 'unpacked', fixture)
    const actual = sync(dir)
    const expected = md5hex([
      ownHash,
      dir,
      bytes(files[fixture]['package.json']),
      bytes(files[fixture]['.git/HEAD']),
      bytes(files[fixture]['.git/packed-refs']),
      bytes(files[fixture]['.git/refs/heads/master']),
      execFileSync ? bytes(diffs[fixture]) : null
    ].filter(Boolean))

    t.true(actual === expected)
  })
})

test('does not use the diff if execFileSync is not available', t => {
  const { sync: syncWithoutExecFileSync } = proxyquire.noCallThru()('../', {
    child_process: {}
  })
  const hash = new Buffer(syncWithoutExecFileSync(resolve('..')), 'hex')

  const dir = resolve('fixtures', 'unpacked', 'dirty-repo')
  const actual = syncWithoutExecFileSync(dir)
  const expected = md5hex([
    hash,
    dir,
    bytes(files['dirty-repo']['package.json']),
    bytes(files['dirty-repo']['.git/HEAD']),
    bytes(files['dirty-repo']['.git/refs/heads/master'])
  ])

  t.true(actual === expected)
})

if (spawnSync) {
  test('diffing should not write to stderr', t => {
    const child = spawnSync(process.execPath, ['_hash-fake-repo.js'])
    t.true(child.stderr.toString('utf8') === '')
  })
}

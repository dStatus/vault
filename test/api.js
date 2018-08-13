const test = require('ava')
const os = require('os')
const path = require('path')
const fs = require('fs')
const tempy = require('tempy')
const {shareDWeb, createDWeb} = require('./lib/dweb-helpers')
const DWebVault = require('../')

var testStaticDWeb, testStaticDWebURL
var createdVault
var fakeDWebURL = 'dweb://' + ('f'.repeat(64)) + '/'
var dbrowserPng = fs.readFileSync(__dirname + '/scaffold/test-static-dweb/dbrowser.png')

test.before(async t => {
  // share the test static dweb
  testStaticDWeb = await shareDWeb(__dirname + '/scaffold/test-static-dweb')
  testStaticDWebURL = 'dweb://' + testStaticDWeb.vault.key.toString('hex') + '/'
})

// tests
//

test('vault.readdir', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})

  // root dir
  let listing1 = await vault.readdir('/')
  t.deepEqual(listing1.sort(), ['dbrowser.png', 'hello.txt', 'subdir'])

  // subdir
  let listing2 = await vault.readdir('/subdir')
  t.deepEqual(listing2.sort(), ['hello.txt', 'space in the name.txt'])

  // root dir stat=true
  let listing3 = await vault.readdir('/', {stat: true})
  listing3 = listing3.sort()
  t.is(listing3[0].name, 'dbrowser.png')
  t.truthy(listing3[0].stat)
  t.is(listing3[1].name, 'hello.txt')
  t.truthy(listing3[1].stat)
  t.is(listing3[2].name, 'subdir')
  t.truthy(listing3[2].stat)

  // subdir stat=true
  let listing4 = await vault.readdir('/subdir', {stat: true})
  listing4 = listing4.sort()
  t.is(listing4[0].name, 'hello.txt')
  t.truthy(listing4[0].stat)
  t.is(listing4[1].name, 'space in the name.txt')
  t.truthy(listing4[1].stat)
})

test('vault.readFile', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})

  // read utf8
  var helloTxt = await vault.readFile('hello.txt')
  t.deepEqual(helloTxt, 'hello')

  // read utf8 2
  var helloTxt2 = await vault.readFile('/subdir/hello.txt', 'utf8')
  t.deepEqual(helloTxt2, 'hi')

  // read utf8 when spaces are in the name
  var helloTxt2 = await vault.readFile('/subdir/space in the name.txt', 'utf8')
  t.deepEqual(helloTxt2, 'hi')

  // read hex
  var dbrowserPngHex = await vault.readFile('dbrowser.png', 'hex')
  t.deepEqual(dbrowserPngHex, dbrowserPng.toString('hex'))

  // read base64
  var dbrowserPngBase64 = await vault.readFile('dbrowser.png', 'base64')
  t.deepEqual(dbrowserPngBase64, dbrowserPng.toString('base64'))

  // read binary
  var dbrowserPngBinary = await vault.readFile('dbrowser.png', 'binary')
  t.truthy(dbrowserPng.equals(dbrowserPngBinary))

  // timeout: read an vault that does not exist
  var badVault = new DWebVault(fakeDWebURL, {localPath: tempy.directory()})
  await t.throws(badVault.readFile('hello.txt', { timeout: 500 }))
})

test('vault.stat', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})

  // stat root file
  var entry = await vault.stat('hello.txt')
  t.deepEqual(entry.isFile(), true, 'root file')

  // stat subdir file
  var entry = await vault.stat('subdir/hello.txt')
  t.deepEqual(entry.isFile(), true, 'subdir file')

  // stat subdir
  var entry = await vault.stat('subdir')
  t.deepEqual(entry.isDirectory(), true, 'subdir')

  // stat non-existent file
  await t.throws(vault.stat('notfound'))

  // stat alt-formed path
  var entry = await vault.stat('/hello.txt')
  t.deepEqual(entry.isFile(), true, 'alt-formed path')

  // stat path w/spaces in it
  var entry = await vault.stat('/subdir/space in the name.txt')
  t.deepEqual(entry.isFile(), true, 'path w/spaces in it')

  // stat path w/spaces in it
  var entry = await vault.stat('/subdir/space%20in%20the%20name.txt')
  t.deepEqual(entry.isFile(), true, 'path w/spaces in it')

  // timeout: stat an vault that does not exist
  var badVault = new DWebVault(fakeDWebURL, {localPath: tempy.directory()})
  await t.throws(badVault.stat('hello.txt', { timeout: 500 }))
})

test('DWebVault.create', async t => {
  // create it
  createdVault = await DWebVault.create({
    localPath: tempy.directory(),
    title: 'The Title',
    description: 'The Description',
    type: 'dataset',
    author: {name: 'Bob', url: 'dweb://ffffffffffffffffffffffffffffffff'}
  })

  // check the dweb.json
  var manifest = JSON.parse(await createdVault.readFile('dweb.json'))
  t.deepEqual(manifest.title, 'The Title')
  t.deepEqual(manifest.description, 'The Description')
  t.deepEqual(manifest.type, ['dataset'])
  t.deepEqual(manifest.author, {name: 'Bob', url: 'dweb://ffffffffffffffffffffffffffffffff'})
})

test('DWebVault.load', async t => {
  // create it
  var loadedVault = await DWebVault.load({
    localPath: createdVault._localPath
  })

  // check the dweb.json
  var manifest = JSON.parse(await loadedVault.readFile('dweb.json'))
  t.deepEqual(manifest.title, 'The Title')
  t.deepEqual(manifest.description, 'The Description')
  t.deepEqual(manifest.type, ['dataset'])
  t.deepEqual(manifest.author, {name: 'Bob', url: 'dweb://ffffffffffffffffffffffffffffffff'})
})

test('vault.configure', async t => {
  // configure it
  await createdVault.configure({
    title: 'The New Title',
    description: 'The New Description',
    type: ['dataset', 'foo'],
    author: {name: 'Robert', url: 'dweb://ffffffffffffffffffffffffffffffff'}
  })

  // check the dweb.json
  var manifest = JSON.parse(await createdVault.readFile('dweb.json'))
  t.deepEqual(manifest.title, 'The New Title')
  t.deepEqual(manifest.description, 'The New Description')
  t.deepEqual(manifest.type, ['dataset', 'foo'])
  t.deepEqual(manifest.author, {name: 'Robert', url: 'dweb://ffffffffffffffffffffffffffffffff'})
})

test('vault.writeFile', async t => {
  async function dotest (filename, content, encoding) {
    // write to the top-level
    await createdVault.writeFile(filename, content, encoding)

    // read it back
    var res = await createdVault.readFile(filename, encoding)
    if (encoding === 'binary') {
      t.truthy(content.equals(res))
    } else {
      t.deepEqual(res, content)
    }
  }

  var dbrowserPng = fs.readFileSync(__dirname + '/scaffold/test-static-dweb/dbrowser.png')
  await dotest('hello.txt', 'hello world', 'utf8')
  await dotest('dbrowser1.png', dbrowserPng, 'binary')
  await dotest('dbrowser2.png', dbrowserPng.toString('base64'), 'base64')
  await dotest('dbrowser3.png', dbrowserPng.toString('hex'), 'hex')
})

test('vault.writeFile gives an error for malformed names', async t => {
  await t.throws(createdVault.writeFile('/', 'hello world'))
  await t.throws(createdVault.writeFile('/subdir/hello.txt/', 'hello world'))
  await t.throws(createdVault.writeFile('hello`.txt', 'hello world'))
})

test('vault.writeFile protects the manifest', async t => {
  await t.throws(createdVault.writeFile('dweb.json', 'hello world'))
})

test('vault.mkdir', async t => {
  await createdVault.mkdir('subdir')
  var res = await createdVault.stat('subdir')
  t.deepEqual(res.isDirectory(), true)
})

test('vault.writeFile writes to subdirectories', async t => {
  await createdVault.writeFile('subdir/hello.txt', 'hello world', 'utf8')
  var res = await createdVault.readFile('subdir/hello.txt', 'utf8')
  t.deepEqual(res, 'hello world')
})

test('versioned reads and writes', async t => {
  // create a fresh dweb
  var vault = await DWebVault.create({localPath: tempy.directory(), title: 'Another Test DWeb'})

  // do some writes
  await vault.writeFile('/one.txt', 'a', 'utf8')
  await vault.writeFile('/two.txt', 'b', 'utf8')
  await vault.writeFile('/one.txt', 'c', 'utf8')

  // check history
  var history = await vault.history()
  if (history.length !== 4) {
    console.log('Weird history', history)
  }
  t.deepEqual(history.length, 4)

  // helper
  function checkout (v) {
    return new DWebVault(vault.url + v, {localPath: tempy.directory()})
  }

  // read back versions
  t.deepEqual((await checkout('+1').readdir('/')).length, 1)
  t.deepEqual((await checkout('+2').readdir('/')).length, 2)
  t.deepEqual((await checkout('+3').readdir('/')).length, 3)
  t.deepEqual((await checkout('+2').readFile('/one.txt')), 'a')
  t.deepEqual((await checkout('+4').readFile('/one.txt')), 'c')
  var statRev2 = await checkout('+2').stat('/one.txt')
  var statRev4 = await checkout('+4').stat('/one.txt')
  t.truthy(statRev2.offset < statRev4.offset)
})

test('Fail to write to unowned vaults', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})
  await t.throws(vault.writeFile('/denythis.txt', 'hello world', 'utf8'))
  await t.throws(vault.mkdir('/denythis'))
})

test('vault.getInfo', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})
  var info = await vault.getInfo()
  t.deepEqual(info.isOwner, false)
  t.deepEqual(info.version, 4)
})

test('vault.download', async t => {
  var vault = new DWebVault(testStaticDWebURL, {localPath: tempy.directory()})

  // ensure not yet downloaded
  var res = await vault.stat('/hello.txt')
  t.deepEqual(res.downloaded, 0)

  // download
  await vault.download('/hello.txt')

  // ensure downloaded
  var res = await vault.stat('/hello.txt')
  t.deepEqual(res.downloaded, res.blocks)

  // ensure not yet downloaded
  var res = await vault.stat('/subdir/hello.txt')
  t.deepEqual(res.downloaded, 0)

  // download
  await vault.download('/')

  // ensure downloaded
  var res = await vault.stat('/subdir/hello.txt')
  t.deepEqual(res.downloaded, res.blocks)
})

test('vault.createFileActivityStream', async t => {
  // create a fresh dweb
  var vault = await DWebVault.create({localPath: tempy.directory(), title: 'Another Test DWeb'})
  await vault._loadPromise

  // start the stream
  var res = []
  var events = vault.createFileActivityStream()
  events.addEventListener('changed', function ({path}) {
    res.push(path)
  })

  // make changes
  await vault.writeFile('/a.txt', 'one', 'utf8')
  await vault.writeFile('/b.txt', 'one', 'utf8')
  await vault.writeFile('/a.txt', 'one', 'utf8')
  await vault.writeFile('/a.txt', 'two', 'utf8')
  await vault.writeFile('/b.txt', 'two', 'utf8')
  await vault.writeFile('/c.txt', 'one', 'utf8')

  var n = 0
  while (res.length !== 6 && ++n < 10) {
    await sleep(500)
  }
  t.deepEqual(res, ['/a.txt', '/b.txt', '/a.txt', '/a.txt', '/b.txt', '/c.txt'])
})

test('vault.createNetworkActivityStream', async t => {
  // share the test static dweb
  var testStaticDWeb2 = await createDWeb()
  var testStaticDWeb2URL = 'dweb://' + testStaticDWeb2.vault.key.toString('hex')
  var vault = new DWebVault(testStaticDWeb2URL, {localPath: tempy.directory()})
  await vault._loadPromise

  // start the download & network stream
  var res = {
    metadata: {
      down: 0,
      all: false
    },
    content: {
      down: 0,
      all: false
    }
  }
  var events = vault.createNetworkActivityStream()
  events.addEventListener('network-changed', () => {
    res.gotPeer = true
  })
  events.addEventListener('download', ({feed}) => {
    res[feed].down++
  })
  events.addEventListener('sync', ({feed}) => {
    res[feed].all = true
  })

  // do writes
  await new Promise(resolve => {
    testStaticDWeb2.importFiles(__dirname + '/scaffold/test-static-dweb', resolve)
  })

  // download
  await vault.download()

  var n = 0
  while (!res.content.all && ++n < 10) {
    await sleep(500)
  }
  t.truthy(res.metadata.down > 0)
  t.truthy(res.content.down > 0)
  t.deepEqual(res.metadata.all, true)
  t.deepEqual(res.content.all, true)
})

function sleep (time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

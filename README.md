## @dstatus/vault

A NodeJS API for DWEB which is compatible with dStatus' DWebVault API. Useful for testing and for writing apps that work in the browser and in nodejs.

```js
var DWebVault = require('@dstatus/vault')

// create a new vault
var vault = await DWebVault.create({
  localPath: './my-vault-data',
  title: 'My Vault',
  description: 'A test of the node DWebVault API'
})

// load an existing vault from disk
var vault = await DWebVault.load({
  localPath: './my-vault-data'
})

// load an existing vault from the URL:
var vault = new DWebVault(dwebUrl, {localPath: './my-vault-data'})

// using the instance
await vault.writeFile('hello.txt', 'world')
var names = await vault.readdir('/')
console.log(names) // => ['hello.txt']
```

By default, `@dstatus/vault` stores the dStatus data in the `localPath` folder using the SLEEP format (DWEB's internal structure).
If you want the folder to show the latest files (the dPack cli behavior) pass `latest: true` in the `dwebOptions`.

```js
var vault = await DWebVault.create({
  localPath: './my-vault-data',
  dwebOptions: {latest: true}
})
var vault = await DWebVault.load({
  localPath: './my-vault-data',
  dwebOptions: {latest: true}
})
var vault = new DWebVault(dwebUrl, {
  localPath: './my-vault-data',
  dwebOptions: {latest: true}
})
```

You can also pass options through to [@dpack/core](https://github.com/dpacks/core) with `dwebOptions`, or pass options to its `.joinNetwork([opts])` method with `netOptions`:

```js
var vault = new DWebVault(dwebUrl, {
  localPath: './my-vault-data',
  dwebOptions: {
    live: true
  },
  netOptions: {
    upload: false
  }
})
```

This will extend dStatus's Vault defaults.

### Differences from Browser API

 - This module adds the `localPath` parameter. Use the `localPath` to specify where the data for the vault should be stored. If not provided, the vault will be stored in memory.
 - This module also adds `dwebOptions` and `netOptions` to configure the [@dpack/core](https://github.com/dpacks/core) usage.
 - This module also adds `DWebVault.load()` to read an vault from disk.
 - This module does *yet* not include `DWebVault.fork`.
 - This module does *yet* not include `DWebVault.unlink`.
 - This module will not include `DWebVault.selectVault`.
 - `vault.getInfo()` does not give a valid `mtime` or `size`.
 - `networked:` opt is not yet supported.

### Quick API reference

Refer to the [dStatus's `DWebVault` docs](https://docs.dstatus.io/apis/vault).

```js
var vault = new DWebVault(url, {localPath:, dwebOptions:, netOptions:})
var vault = await DWebVault.create({localPath:, dwebOptions:, netOptions:, title:, description:, type:, author:, networked:})
var vault = await DWebVault.load({localPath:, dwebOptions:, netOptions:})
var key = await DWebVault.resolveName(url)
vault.url
await vault.configure({title:, description:, type:, author:, networked:})
var info = await vault.getInfo({timeout:})
var stat = await vault.stat(path, {timeout:})
var content = await vault.readFile(path, {encoding:, timeout:})
var names = vault.readdir(path, {recursive:, stat:, timeout:})
await vault.writeFile(path, data, encoding)
await vault.mkdir(path)
await vault.unlink(path)
await vault.rmdir(path, {recursive:})
var history = await vault.history({start:, end:, reverse:, timeout:})
await vault.download(path, {timeout:})
var emitter = vault.createFileActivityStream(pattern)
var emitter = vault.createNetworkActivityStream()

// node-only:
vault._loadPromise // promise for when the vault is ready to use
vault._close() // exit swarm, close all files
```

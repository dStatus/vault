const path = require('path')
const fs = require('fs')
const parseDWebURL = require('@dwebs/parse')
const pda = require('@dpack/api')
const concat = require('concat-stream')
const DWeb = require('@dpack/core')
const ram = require('random-access-memory')
const {dwebDns, timer, toEventTarget} = require('./lib/util')
const {
  DWEB_MANIFEST_FILENAME,
  DWEB_VALID_PATH_REGEX,
  DEFAULT_DWEB_API_TIMEOUT
} = require('./lib/const')
const {
  VaultNotWritableError,
  ProtectedFileNotWritableError,
  InvalidPathError
} = require('@dbrowser/errors')

// exported api
// =

const to = (opts) =>
  (opts && typeof opts.timeout !== 'undefined')
    ? opts.timeout
    : DEFAULT_DWEB_API_TIMEOUT

class DWebVault {
  constructor (url, {localPath, dwebOptions, netOptions} = {}) {

    // parse URL
    const urlp = url ? parseDWebURL(url) : null
    this.url = urlp ? `dweb://${urlp.hostname}` : null

    // load the vault
    this._vault = null
    this._checkout = null
    this._version = urlp && urlp.version ? +urlp.version : null
    this._localPath = localPath
    this._loadPromise = new Promise((resolve, reject) => {
      // TODO resolve DNS
      const temp = !localPath
      let options = urlp ? {key: urlp.hostname, sparse: true, temp} : {indexing: false, temp}
      if (dwebOptions) {
        Object.keys(dwebOptions).forEach((key) => {
          options[key] = dwebOptions[key]
        })
      }
      if (typeof options.latest === 'undefined') {
        options.latest = false
      }
      DWeb(localPath || ram, options, async (err, dweb) => {
        if (err) {
          return reject(err)
        }
        dweb.joinNetwork(netOptions)
        this.url = this.url || `dweb://${dweb.vault.key.toString('hex')}`
        this._vault = dweb.vault
        this._checkout = (this._version) ? dweb.vault.checkout(this._version) : dweb.vault
        this._close = async () => {
          await new Promise((resolve, reject) => {
            dweb.close(err => {
              if (err) reject(err)
              else resolve()
            })
          })
        }

        // await initial metadata sync if not the owner
        if (!dweb.vault.writable && !dweb.vault.metadata.length) {
          // wait to receive a first update
          await new Promise((resolve, reject) => {
            dweb.vault.metadata.update(err => {
              if (err) reject(err)
              else resolve()
            })
          })
        }

        resolve()
      })
    })
  }

  static async create ({localPath, dwebOptions, netOptions, title, description, type, author}) {
    // make sure the directory DNE or is empty
    if (localPath) {
      let st = await new Promise(resolve => fs.stat(localPath, (err, st) => resolve(st)))
      if (st) {
        if (!st.isDirectory()) {
          throw new Error('Cannot create DWeb vault. (A file exists at the target location.)')
        }
        let listing = await new Promise(resolve => fs.readdir(localPath, (err, listing) => resolve(listing)))
        if (listing && listing.length > 0) {
          throw new Error('Cannot create DWeb vault. (The target folder is not empty.)')
        }
      }
    }

    // create the dweb
    var vault = new DWebVault(null, {localPath, dwebOptions, netOptions})
    await vault._loadPromise
    await pda.writeManifest(vault._vault, {url: vault.url, title, description, type, author})
    return vault
  }

  static async load ({localPath, dwebOptions, netOptions}) {
    if (!localPath) {
      throw new Error('Must provide {localPath}.')
    }

    // make sure the directory exists
    var st = await new Promise(resolve => fs.stat(localPath, (err, st) => resolve(st)))
    if (!st || !st.isDirectory()) {
      throw new Error('Cannot load DWeb vault. (No folder exists at the given location.)')
    }

    // load the dweb
    var vault = new DWebVault(null, {localPath, dwebOptions, netOptions})
    await vault._loadPromise
    return vault
  }

  async configure (settings) {
    await this._loadPromise
    if (!settings || typeof settings !== 'object') throw new Error('Invalid argument')
    if ('title' in settings || 'description' in settings || 'type' in settings || 'author' in settings) {
      await pda.updateManifest(this._vault, settings)
    }
    if ('networked' in settings) {
      // TODO
    }
  }

  async getInfo (url, opts = {}) {
    return timer(to(opts), async () => {
      await this._loadPromise

      // read manifest
      var manifest
      try {
        manifest = await pda.readManifest(this._checkout)
      } catch (e) {
        manifest = {}
      }

      // return
      return {
        key: this._vault.key.toString('hex'),
        url: this.url,
        isOwner: this._vault.writable,

        // state
        version: this._checkout.version,
        peers: this._vault.metadata.peers.length,
        mtime: 0,
        size: 0,

        // manifest
        title: manifest.title,
        description: manifest.description,
        type: manifest.type,
        author: manifest.author
      }
    })
  }

  async diff () {
    // noop
    return []
  }

  async commit () {
    // noop
    return []
  }

  async revert () {
    // noop
    return []
  }

  async history (opts = {}) {
    return timer(to(opts), async () => {
      await this._loadPromise
      var reverse = opts.reverse === true
      var {start, end} = opts

      // if reversing the output, modify start/end
      start = start || 0
      end = end || this._checkout.metadata.length
      if (reverse) {
        // swap values
        let t = start
        start = end
        end = t
        // start from the end
        start = this._checkout.metadata.length - start
        end = this._checkout.metadata.length - end
      }

      return new Promise((resolve, reject) => {
        var stream = this._checkout.history({live: false, start, end})
        stream.pipe(concat({encoding: 'object'}, values => {
          values = values.map(massageHistoryObj)
          if (reverse) values.reverse()
          resolve(values)
        }))
        stream.on('error', reject)
      })
    })
  }

  async stat (filepath, opts = {}) {
    filepath = massageFilepath(filepath)
    return timer(to(opts), async () => {
      await this._loadPromise
      return pda.stat(this._checkout, filepath)
    })
  }

  async readFile (filepath, opts = {}) {
    filepath = massageFilepath(filepath)
    return timer(to(opts), async () => {
      await this._loadPromise
      return pda.readFile(this._checkout, filepath, opts)
    })
  }

  async writeFile (filepath, data, opts = {}) {
    filepath = massageFilepath(filepath)
    return timer(to(opts), async () => {
      await this._loadPromise
      if (this._version) throw new VaultNotWritableError('Cannot modify a historic version')
      await assertWritePermission(this._vault)
      await assertValidFilePath(filepath)
      await assertUnprotectedFilePath(filepath)
      return pda.writeFile(this._vault, filepath, data, opts)
    })
  }

  async unlink (filepath) {
    filepath = massageFilepath(filepath)
    return timer(to(), async () => {
      await this._loadPromise
      if (this._version) throw new VaultNotWritableError('Cannot modify a historic version')
      await assertWritePermission(this._vault)
      await assertUnprotectedFilePath(filepath)
      return pda.unlink(this._vault, filepath)
    })
  }

  async download (filepath, opts = {}) {
    filepath = massageFilepath(filepath)
    return timer(to(opts), async (checkin) => {
      await this._loadPromise
      if (this._version) throw new Error('Not yet supported: can\'t download() old versions yet. Sorry!') // TODO
      if (this._vault.writable) {
        return // no need to download
      }
      return pda.download(this._vault, filepath)
    })
  }

  async readdir (filepath, opts = {}) {
    filepath = massageFilepath(filepath)
    return timer(to(opts), async () => {
      await this._loadPromise
      var names = await pda.readdir(this._checkout, filepath, opts)
      if (opts.stat) {
        for (let i = 0; i < names.length; i++) {
          names[i] = {
            name: names[i],
            stat: await pda.stat(this._checkout, path.join(filepath, names[i]))
          }
        }
      }
      return names
    })
  }

  async mkdir (filepath) {
    filepath = massageFilepath(filepath)
    return timer(to(), async () => {
      await this._loadPromise
      if (this._version) throw new VaultNotWritableError('Cannot modify a historic version')
      await assertWritePermission(this._vault)
      await assertValidPath(filepath)
      await assertUnprotectedFilePath(filepath)
      return pda.mkdir(this._vault, filepath)
    })
  }

  async rmdir (filepath, opts = {}) {
    return timer(to(opts), async () => {
    filepath = massageFilepath(filepath)
      await this._loadPromise
      if (this._version) throw new VaultNotWritableError('Cannot modify a historic version')
      await assertUnprotectedFilePath(filepath)
      return pda.rmdir(this._vault, filepath, opts)
    })
  }

  createFileActivityStream (pathPattern) {
    return toEventTarget(pda.createFileActivityStream(this._vault, pathPattern))
  }

  createNetworkActivityStream () {
    return toEventTarget(pda.createNetworkActivityStream(this._vault))
  }

  static async resolveName (name) {
    return dwebDns.resolveName(name)
  }
}

module.exports = DWebVault

// internal helpers
// =

// helper to check if filepath refers to a file that userland is not allowed to edit directly
function assertUnprotectedFilePath (filepath) {
  if (filepath === '/' + DWEB_MANIFEST_FILENAME) {
    throw new ProtectedFileNotWritableError()
  }
}

async function assertWritePermission (vault) {
  // ensure we have the vault's private key
  if (!vault.writable) {
    throw new VaultNotWritableError()
  }
  return true
}

async function assertValidFilePath (filepath) {
  if (filepath.slice(-1) === '/') {
    throw new InvalidPathError('Files can not have a trailing slash')
  }
  await assertValidPath(filepath)
}

async function assertValidPath (fileOrFolderPath) {
  if (!DWEB_VALID_PATH_REGEX.test(fileOrFolderPath)) {
    throw new InvalidPathError('Path contains invalid characters')
  }
}

function massageHistoryObj ({name, version, type}) {
  return {path: name, version, type}
}

function massageFilepath (filepath) {
  filepath = filepath || ''
  filepath = decodeURIComponent(filepath)
  if (!filepath.startsWith('/')) {
    filepath = '/' + filepath
  }
  return filepath
}

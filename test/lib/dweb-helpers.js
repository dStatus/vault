const DWeb = require('dat-node')
const tempy = require('tempy')

exports.shareDWeb = function (dir) {
  return new Promise((resolve, reject) => {
    DWeb(dir, {temp: true}, function (err, dweb) {
      if (err) return reject(err)
      dweb.joinNetwork()
      dweb.importFiles(dir, function (err) {
        if (err) return reject(err)
        resolve(dat)
      })
    })
  })
}

exports.createDWeb = function () {
  return new Promise((resolve, reject) => {
    DWeb(tempy.directory(), {temp: true}, function (err, dweb) {
      if (err) return reject(err)
      dweb.joinNetwork()
      resolve(dweb)
    })
  })
}

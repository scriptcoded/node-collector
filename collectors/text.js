const merge = require('merge')

module.exports = function textCollector (_options) {
  const options = merge({
    trim: false
  }, _options)

  return function ({ $target }) {
    let collected = $target.text()

    if (options.trim) {
      collected = collected.trim()
    }

    return collected
  }
}

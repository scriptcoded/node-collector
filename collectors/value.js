const merge = require('merge')

module.exports = function attrCollector (_options) {
  const options = merge({
    
  }, _options)

  return function ({ $target, config }) {
    let collected = $target.val()

    return collected
  }
}

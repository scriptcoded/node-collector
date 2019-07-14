const merge = require('merge')

module.exports = function attrCollector (attributeName, _options) {
  const options = merge({
    extendLinks: true,
    forceLinkExtension: false
  }, _options)

  return function ({ $target, config }) {
    let collected = $target.attr(attributeName)
    
    if ((attributeName === 'href' && options.extendLinks) || options.forceLinkExtension) {
      const url = new URL(collected, config.url)

      collected = url.href
    }

    return collected
  }
}

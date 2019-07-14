/**
 * Template literal tag for parsing DOM Query Language
 */
module.exports = function dql (strings, ...variables) {
  let fullString = ''

  for (let i in strings) {
    fullString += strings[i] + (variables[i] || '')
  }

  const fullStringMatch = fullString.match(/^([^{]+){(.*)}$/)

  const selectorString = fullStringMatch[1].trim()
  const getterString = fullStringMatch[2].trim()

  const getterMatch = getterString.match(/^([a-z0-9]+)(?:\((.*)\))?$/i)

  const getterMethodName = getterMatch[1].trim()
  
  let getterArguments
  if (getterMatch[2]) {
    getterArguments = getterMatch[2]
      .split(',')
      .map(arg => arg.trim())
  } else {
    getterArguments = []
  }

  return {
    raw: fullString,
    selector: selectorString,
    getter: {
      raw: getterString,
      methodName: getterMethodName,
      arguments: getterArguments
    }
  }
}
function extractVariables (string) {
  let matches = []

  const regex = /\$([a-z0-9]+)|\${([a-z0-9]+)}/gi

  let match
  while (match = regex.exec(string)) { // eslint-disable-line no-cond-assign
    matches = [...matches, match[1] || match[2]]
  }

  return matches
}

function prepareToposort (dependencies) {
  let deps = []

  for (const dep of dependencies) {
    for (const subDep of dep.dependsOn) {
      deps = [...deps, [dep.name, subDep]]
    }
  }

  return deps
}

function fillUrlParms (url, params) {
  return url.replace(/:([a-z0-9]+)\??/gi, (...args) => {
    const replacement = params[args[1]]
    
    if (replacement != null) {
      return replacement
    }

    return ''
  })
}

module.exports = {
  extractVariables,
  prepareToposort,
  fillUrlParms
}
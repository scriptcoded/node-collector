// { default: axios } hack to make TypeScript happy
const { default: axios } = require('axios')
const cheerio = require('cheerio')
const crypto = require('crypto')
const toposort = require('toposort')

require('colors')

const {
  extractVariables,
  prepareToposort,
  fillUrlParms
} = require('./util')

// function hash (string) {
//   return crypto
//     .createHash('sha1')
//     .update(string)
//     .digest('base64')
// }

/**
 * TODO: Move data storage from this.fields and this.computed
 * to a separate object for every item. Something like
 * this.items = [] which contains an object for every item with
 * the following properties:
 *  {
 *    fields: {},
 *    computed: {},
 *    resources: {}
 *  }
 */

module.exports = class Collection {
  constructor (config) {
    this.config = config

    this.resources = {}
    this.fields = null
    this.computed = null

    this.dependencies = []

    this.resourceCache = {}

    this.items = []

    this.itemDataTemplate = {
      resources: {},
      fields: {},
      computed: {}
    }

    this.pendingCount = 0
    this.completedCount = 0
  }

  async parse () {
    this.indexResources()
    this.indexFields()
    this.indexComputed()

    this.validateFields()

    this.calculateDependencies()

    // console.log('Resources:', this.resources, '\n')
    // console.log('Fields:', this.fields, '\n')
    // console.log('Computed:', this.computed, '\n')
    // console.log('Dependencies:', this.dependencies, '\n')

    const response = await axios.get(this.config.url)
    
    console.log('Loading base'.cyan)

    const $ = cheerio.load(response.data)
    const $items = $(this.config.item.selector)
    // .slice(0, 10)

    console.log('Parsing items'.cyan)
    await Promise.all($items.map(this.parseItem($)).toArray())
  }

  indexResources () {
    console.log('Indexing resources'.cyan)

    const resources = this.config.item.resources

    Object.keys(this.resources).map(key => {
      this.itemDataTemplate.resources[key] = {
        _content: null
      }
    })

    for (const [resourceName, resource] of Object.entries(resources)) {
      const params = resource.url
        .match(/:[a-z0-9]+\??/gi)
        .reduce((obj, param) => {
          let name = param.substr(1)
          let optional = false

          if (param.endsWith('?')) {
            name = param.substr(0, -1),
            optional = true
          }

          return {
            ...obj,
            [name]: {
              optional
            }
          }
        }, {})

      this.resources[resourceName] = {
        url: resource.url,
        params
      }

      this.dependencies = [...this.dependencies, {
        type: 'resource',
        name: resourceName,
        dependsOn: []
      }]
    }
  }

  indexFields () {
    console.log('Indexing fields'.cyan)

    this.fields = this.config.item
      .fields({
        resource: this._resource()
      })

    Object.keys(this.fields).map(key => {
      this.itemDataTemplate.fields[key] = {
        _value: null
      }
    })

    for (const [fieldName, field] of Object.entries(this.fields)) {
      let dependsOn = []

      if (field.from) {
        let deps = Object.values(field.from.args)
          .map(extractVariables)

        // Flatten array
        deps = [].concat.apply([], deps)

        dependsOn = [
          ...dependsOn,
          ...deps,
          field.from.name
        ]
      }

      dependsOn = [
        ...dependsOn,
        ...extractVariables(field.selector)
      ]

      // TODO: Implement collect if necessary

      dependsOn = [...new Set(dependsOn)]

      this.dependencies = [...this.dependencies, {
        type: 'field',
        name: fieldName,
        dependsOn
      }]
    }
  }

  indexComputed () {
    console.log('Indexing computed'.cyan)

    this.computed = this.config.item.computed

    Object.keys(this.computed).map(key => {
      this.itemDataTemplate.computed[key] = {
        _value: null
      }
    })

    for (const [computedName, computed] of Object.entries(this.computed)) {
      const dependsOn = computed.use

      this.dependencies = [...this.dependencies, {
        type: 'computed',
        name: computedName,
        dependsOn
      }]
    }
  }

  validateFields () {
    console.log('Validating fields'.cyan)

    for (const [name, field] of Object.entries(this.fields)) {
      if (field.from) {
        const resource = this.resources[field.from.name]

        const args = Object.keys(field.from.args)
        const requiredArgs = Object.keys(resource.params)
        const missingArgs = requiredArgs
          .filter(arg => !args.includes(arg) && !resource.params[arg].optional)

        if (missingArgs.length > 0) {
          throw new Error(`Missing required arguments for resource "${field.from.name}" in field "${name}": ${missingArgs.join(', ')}`)
        }
      }
    }
  }

  calculateDependencies () {
    console.log('Calculdating dependencies'.cyan)
    
    const allDeps = this.dependencies.map(dep => dep.name)

    const toposortReady = prepareToposort(this.dependencies)

    let sortedDeps
    try {
      // @ts-ignore
      sortedDeps = toposort.array(allDeps, toposortReady)
    } catch (e) {
      const isCyclic = e.message.includes('Cyclic dependency')

      if (isCyclic) {
        const node = e.message.split(':')[1].replace(/"/g, '')

        throw new Error(`Cyclic dependency discovered: "${node}"`)
      }

      throw e
    }
      
    this.dependencies = sortedDeps 
      .map(name => this.dependencies.find(dep => dep.name === name))
      .reverse()
  }

  parseItem ($) {
    const self = this
    
    return async function (itemIndex) {
      // console.log(`Parsing item ${index.toString().blue}`.cyan)
      self.pendingCount += 1

      self.items[itemIndex] = JSON.parse(JSON.stringify(self.itemDataTemplate))

      const $elem = $(this)
      
      for (const dependency of self.dependencies) {

        let $cheerioInstance
        let $elemInstance

        if (dependency.type === 'field') {
          const field = self.fields[dependency.name]

          if (field.from) {
            const resource = self.resources[field.from.name]
  
            const args = {}

            for (const [argName, argValue] of Object.entries(field.from.args)) {
              const value = argValue.replace(/\$([a-z0-9]+)|\${([a-z0-9]+)}/gi, (match, a, b) => {
                const varName = a || b
                
                let varValue = null
                if (self.fields[varName]) {
                  varValue = self.items[itemIndex].fields[varName]._value
                } else
                if (self.computed[varName]) {
                  varValue = self.items[itemIndex].computed[varName]._value
                }
                
                return varValue
              })

              args[argName] = value
            }
  
            const resourceUrl = fillUrlParms(resource.url, args)

            let content

            if (self.resourceCache[resourceUrl]) {
              console.log(`Found cached version for URL ${resourceUrl.blue}`.cyan)
              content = self.resourceCache[resourceUrl]
            } else {
              console.log(`No cached version for URL ${resourceUrl.blue}`.cyan)
              const result = await axios.get(resourceUrl)

              content = result.data

              // eslint-disable-next-line
              self.resourceCache[resourceUrl] = content
            }

            $cheerioInstance = cheerio.load(content)
            $elemInstance = $cheerioInstance('body')
          } else {
            $cheerioInstance = $
            $elemInstance = $elem
          }
          
          const $target = $elemInstance.find(field.selector)

          let collected = field.collect({
            config: self.config,
            $: $cheerioInstance,
            $elem: $elemInstance,
            $target
          })

          if (field.filter) {
            collected = field.filter(collected)
          }
          
          // eslint-disable-next-line
          self.items[itemIndex].fields[dependency.name]._value = collected
          // console.log(dependency.type.cyan, dependency.name.yellow, field._value)
        } else
        if (dependency.type === 'computed') {
          const computed = self.computed[dependency.name]

          const using = computed.use
            .reduce((obj, name) => {
              if (self.fields[name]) {
                return {
                  ...obj,
                  [name]: self.items[itemIndex].fields[name]._value
                }
              } else
              if (self.computed[name]) {
                return {
                  ...obj,
                  [name]: self.items[itemIndex].computed[name]._value
                }
              }
            }, {})

          self.items[itemIndex].computed[dependency.name]._value = computed.handle(using)

          // console.log(dependency.type.green, dependency.name.yellow, computed._value)
        } else
        if (dependency.type === 'resource') {
          // console.log('Resouce'.magenta)
        } else {
          console.log(`${'Found no handler for the'.red} ${dependency.type.cyan} ${'named'.red} ${dependency.name.cyan}`)
        }
      }

      // eslint-disable-next-line
      self.completedCount += 1

      console.log(`Completed ${self.completedCount}/${self.pendingCount}`)
    }
  }

  _resource () {
    const self = this

    return function (name, ...argsRaw) {
      const resource = self.resources[name]
 
      if (!resource) {
        throw new Error(`Invalid resource name '${name}'`)
      }
  
      let args
      if (typeof argsRaw[0] === 'object') {
        args = argsRaw[0]
      } else {
        args = {}

        for (let i in argsRaw) {
          args[Object.keys(resource.params)[i]] = argsRaw[i]
        }
      }
  
      return {
        name,
        args
      }
    }
  }
}
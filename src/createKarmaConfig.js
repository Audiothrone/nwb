import path from 'path'

import merge from 'webpack-merge'

import createWebpackConfig from './createWebpackConfig'
import debug from './debug'
import getPluginConfig from './getPluginConfig'
import {deepToString, typeOf} from './utils'

const DEFAULT_TESTS = 'tests/**/*-test.js'

/**
 * Framework and reporter config can be passed as strings or as plugin objects.
 * This handles figuring out which names and plugins have been provided and
 * automatically extracting a framework name from a plugin object.
 */
export function processPluginConfig(configs) {
  let names = []
  let plugins = []
  configs.forEach(config => {
    if (typeOf(config) === 'string') {
      names.push(config)
    }
    else {
      names.push(Object.keys(config)[0].split(':').pop())
      plugins.push(config)
    }
  })
  return [names, plugins]
}

/**
 * Finds a karma plugin with the given type:name id. If a plugin object contains
 * multiple plugins (e.g. karma-chai-plugins), only the first will be checked.
 */
export function findPlugin(plugins, findId) {
  for (let i = 0, l = plugins.length; i < l; i++) {
    if (typeOf(plugins[i]) !== 'object') {
      continue
    }
    if (Object.keys(plugins[i])[0] === findId) {
      return plugins[i]
    }
  }
  return null
}

/**
 * Handles creation of Karma config which can vary or be configured by the user.
 */
export function getKarmaConfig({codeCoverage = false} = {}, userConfig = {}) {
  let {karma: userKarma = {}} = userConfig

  let frameworks = []
  // Extra webpack loaders required for the generated Karma config.
  let extraLoaders = []
  // Default reporter to be used if the user configures their own framework but
  // not their own reporter, as the mocha reporter doesn't play nicely with TAP
  // output and who knows which others.
  let reporters = ['dots']
  // You don't seem to be able to mix specifying your own plugins with having
  // them magically located for you, so we're going to have to build a complete
  // list ourselves.
  let plugins = [
    require('karma-phantomjs-launcher'),
    require('karma-sourcemap-loader'),
    require('karma-webpack')
  ]

  // Frameworks can be configured as a list containing names of bundled
  // frameworks, or framework plugin objects.
  if (userKarma.frameworks) {
    let [frameworkNames, frameworkPlugins] = processPluginConfig(userKarma.frameworks)
    frameworks = frameworkNames
    plugins = plugins.concat(frameworkPlugins)
  }
  else {
    // If the user didn't specify their own framework, use the Mocha framework
    // and reporter.
    frameworks = ['mocha']
    reporters = ['mocha']
  }

  // Reporters can be configured as a list containing names of bundled
  // reporters, or reporter plugin objects.
  if (userKarma.reporters) {
    let [reporterNames, reporterPlugins] = processPluginConfig(userKarma.reporters)
    reporters = reporterNames
    plugins = plugins.concat(reporterPlugins)
  }

  // Plugins can be provided as a list of imported plugin objects
  if (userKarma.plugins) {
    plugins = plugins.concat(userKarma.plugins)
  }

  // Ensure nwb's version of mocha plugins get loaded if they're going to be
  // used and haven't been provided by the user.
  if (frameworks.indexOf('mocha') !== -1 && !findPlugin(plugins, 'framework:mocha')) {
    plugins.push(require('karma-mocha'))
  }
  if (reporters.indexOf('mocha') !== -1 && !findPlugin(plugins, 'reporter:mocha')) {
    plugins.push(require('karma-mocha-reporter'))
  }

  if (codeCoverage) {
    extraLoaders.push({
      id: 'isparta',
      test: /\.jsx?$/,
      loader: require.resolve('isparta-loader'),
      include: path.resolve('src')
    })
    reporters.push('coverage')
    plugins.push(require('karma-coverage'))
  }

  return {plugins, frameworks, reporters, extraLoaders}
}

export default function({codeCoverage, singleRun}, userConfig) {
  let userKarma = userConfig.karma || {}
  let pluginConfig = getPluginConfig()

  let {plugins, frameworks, reporters, extraLoaders} = getKarmaConfig({codeCoverage}, userConfig)
  let testFiles = path.resolve(userKarma.tests || DEFAULT_TESTS)
  let preprocessors = {
    [require.resolve('babel-core/lib/polyfill')]: ['webpack'],
    [testFiles]: ['webpack', 'sourcemap']
  }

  let webpackConfig = createWebpackConfig({
    devtool: 'inline-source-map',
    loaders: {
      extra: extraLoaders
    },
    node: {
      fs: 'empty'
    },
    resolve: {
      alias: {
        'src': path.resolve('src')
      },
      // Fall back to resolving runtime dependencies from nwb's dependencies
      fallback: path.join(__dirname, '../node_modules')
    },
    server: true
  }, pluginConfig, userConfig.webpack)

  let karmaConfig = merge({
    browsers: ['PhantomJS'],
    coverageReporter: {
      dir: path.resolve('coverage'),
      reporters: [
        {type: 'html', subdir: 'html'},
        {type: 'lcovonly', subdir: '.'}
      ]
    },
    files: [
      require.resolve('babel-core/lib/polyfill'),
      testFiles
    ],
    frameworks,
    mochaReporter: {
      showDiff: true
    },
    plugins,
    preprocessors,
    reporters,
    singleRun,
    webpack: webpackConfig,
    webpackServer: {
      noInfo: true
    }
  }, userKarma.extra)

  debug('karma config: %s', deepToString(karmaConfig))
  return karmaConfig
}

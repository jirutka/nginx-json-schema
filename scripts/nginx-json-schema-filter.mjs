#!/usr/bin/env node
// @ts-check
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2024 Jakub Jirutka <jakub@jirutka.cz>
// This file is part of https://github.com/jirutka/nginx-json-schema.
/**
 * @typedef {import('json-schema-typed/draft-2020-12').JSONSchema.Interface} JSONSchema
 */
import assert from 'node:assert/strict'
import * as FS from 'node:fs'

const PROG_NAME = 'nginx-json-schema-filter'

const HELP = `\
Usage: ${PROG_NAME} [options] <file>

Arguments:
  <file>                    Path to nginx JSON schema file.

Options:
  -l --list-modules         Don't print the schema, print just filtered module
                            names.

  -x --exclude <modules>... Comma-separated list of nginx modules or groups to
                            remove from the schema. This has higher priority
                            than --include.

  -i --include <modules>... Comma-separated list of nginx modules or groups to
                            keep in the schema. If not provided, all modules are
                            included.

     --id <id>              Change $id of the schema to <id>.

  -h --help                 Show this message and exit.

Module groups:
  @default                  Default modules compiled in nginx (and SSL).
  @optional                 Modules that are not built by default.
  @commercial               Commercial modules.

Homepage: <https://github.com/jirutka/nginx-json-schema>
`

/**
 * @type {{ name: string,  dependsOn: string[] }[]}
 */
export const MODULES = [
  { name: 'http_core', dependsOn: ['@default'] },
  { name: 'http_access', dependsOn: ['@default'] },
  { name: 'http_addition', dependsOn: ['@optional'] },
  { name: 'http_auth_basic', dependsOn: ['@default'] },
  { name: 'http_auth_jwt', dependsOn: ['@commercial'] },
  { name: 'http_auth_request', dependsOn: ['@optional'] },
  { name: 'http_autoindex', dependsOn: ['@default'] },
  { name: 'http_browser', dependsOn: ['@default'] },
  { name: 'http_charset', dependsOn: ['@default'] },
  { name: 'http_dav', dependsOn: ['@optional'] },
  { name: 'http_empty_gif', dependsOn: ['@default'] },
  { name: 'http_f4f', dependsOn: ['@commercial'] },
  { name: 'http_fastcgi', dependsOn: ['@default'] },
  { name: 'http_flv', dependsOn: ['@optional'] },
  { name: 'http_geo', dependsOn: ['@default'] },
  { name: 'http_geoip', dependsOn: ['@optional'] },
  { name: 'http_grpc', dependsOn: ['http_v2'] },
  { name: 'http_gunzip', dependsOn: ['@optional'] },
  { name: 'http_gzip_static', dependsOn: ['@optional'] },
  { name: 'http_gzip', dependsOn: ['@default'] },
  { name: 'http_headers', dependsOn: ['@default'] },
  { name: 'http_hls', dependsOn: ['@commercial'] },
  { name: 'http_image_filter', dependsOn: ['@optional'] },
  { name: 'http_index', dependsOn: ['@default'] },
  { name: 'http_internal_redirect', dependsOn: ['@commercial'] },
  { name: 'http_js', dependsOn: ['@optional'] },
  { name: 'http_keyval', dependsOn: ['@commercial'] },
  { name: 'http_limit_conn', dependsOn: ['@default'] },
  { name: 'http_limit_req', dependsOn: ['@default'] },
  { name: 'http_log', dependsOn: ['@default'] },
  { name: 'http_map', dependsOn: ['@default'] },
  { name: 'http_memcached', dependsOn: ['@default'] },
  { name: 'http_mirror', dependsOn: ['@default'] },
  { name: 'http_mp4', dependsOn: ['@optional'] },
  { name: 'http_perl', dependsOn: ['@optional'] },
  { name: 'http_proxy', dependsOn: ['@default'] },
  { name: 'http_random_index', dependsOn: ['@optional'] },
  { name: 'http_realip', dependsOn: ['@optional'] },
  { name: 'http_referer', dependsOn: ['@default'] },
  { name: 'http_rewrite', dependsOn: ['@default'] },
  { name: 'http_scgi', dependsOn: ['@default'] },
  { name: 'http_secure_link', dependsOn: ['@optional'] },
  { name: 'http_session_log', dependsOn: ['@commercial'] },
  { name: 'http_slice', dependsOn: ['@optional'] },
  { name: 'http_split_clients', dependsOn: ['@default'] },
  { name: 'http_ssi', dependsOn: ['@default'] },
  { name: 'http_ssl', dependsOn: ['@default'] }, // @optional
  { name: 'http_status', dependsOn: ['@default'] },
  { name: 'http_stub_status', dependsOn: ['@optional'] },
  { name: 'http_sub', dependsOn: ['@optional'] },
  { name: 'http_upstream_conf', dependsOn: ['@default'] },
  { name: 'http_upstream_hc', dependsOn: ['@commercial'] },
  { name: 'http_upstream', dependsOn: ['@default'] },
  { name: 'http_userid', dependsOn: ['@default'] },
  { name: 'http_uwsgi', dependsOn: ['@default'] },
  { name: 'http_v2', dependsOn: ['@optional'] },
  { name: 'http_v3', dependsOn: ['@optional'] },
  { name: 'http_xslt', dependsOn: ['@optional'] },

  { name: 'mail_core', dependsOn: ['mail_core'] },
  { name: 'mail_auth_http', dependsOn: ['mail_core'] },
  { name: 'mail_imap', dependsOn: ['mail_core'] },
  { name: 'mail_pop3', dependsOn: ['mail_core'] },
  { name: 'mail_proxy', dependsOn: ['mail_core'] },
  { name: 'mail_realip', dependsOn: ['mail_core'] },
  { name: 'mail_smtp', dependsOn: ['mail_core'] },
  { name: 'mail_ssl', dependsOn: ['mail_core'] }, // @optional

  { name: 'stream_core', dependsOn: ['stream_core'] },
  { name: 'stream_access', dependsOn: ['stream_core'] },
  { name: 'stream_geo', dependsOn: ['stream_core'] },
  { name: 'stream_geoip', dependsOn: ['stream_core', '@optional'] },
  { name: 'stream_js', dependsOn: ['stream_core', '@optional'] },
  { name: 'stream_keyval', dependsOn: ['stream_core', '@commercial'] },
  { name: 'stream_limit_conn', dependsOn: ['stream_core'] },
  { name: 'stream_log', dependsOn: ['stream_core'] },
  { name: 'stream_map', dependsOn: ['stream_core'] },
  { name: 'stream_mqtt_filter', dependsOn: ['stream_core', '@commercial'] },
  { name: 'stream_mqtt_preread', dependsOn: ['stream_core', '@commercial'] },
  { name: 'stream_pass', dependsOn: ['stream_core'] },
  { name: 'stream_proxy', dependsOn: ['stream_core'] },
  { name: 'stream_realip', dependsOn: ['stream_core', '@optional'] },
  { name: 'stream_return', dependsOn: ['stream_core'] },
  { name: 'stream_set', dependsOn: ['stream_core'] },
  { name: 'stream_split_clients', dependsOn: ['stream_core'] },
  { name: 'stream_ssl_preread', dependsOn: ['stream_core', '@optional'] },
  { name: 'stream_ssl', dependsOn: ['stream_core'] }, // @optional
  { name: 'stream_upstream_hc', dependsOn: ['stream_core', '@commercial'] },
  { name: 'stream_upstream', dependsOn: ['stream_core'] },
  { name: 'stream_zone_sync', dependsOn: ['stream_core', '@commercial'] },
]

/**
 * @param {ReadonlySet<string>} include
 * @param {ReadonlySet<string>} exclude
 */
export function filterModules(include, exclude = new Set()) {
  /** @type {Set<string>} */
  const result = new Set()

  for (const name of include) {
    if (!name.startsWith('@')) {
      result.add(name)
    }
  }
  for (const { name, dependsOn } of MODULES) {
    if (dependsOn?.every(dep => include.has(dep) && !exclude.has(dep))) {
      result.add(name)
    }
  }
  for (const { name, dependsOn } of MODULES) {
    if (dependsOn?.some(dep => exclude.has(dep))) {
      result.delete(name)
    }
  }
  for (const name of exclude) {
    result.delete(name)
  }

  result.add('core') // this must be always included

  return result
}

/**
 * @param {JSONSchema} rootSchema
 * @param {Set<string>} modules Names of modules to keep in the schema.
 */
export function filterSchema(rootSchema, modules) {
  assert(rootSchema.$defs, 'Missing $defs in schema')

  const contextSchemas = filterObj(rootSchema.$defs, key => key.startsWith('context:'))
  const moduleSchemas = filterObj(rootSchema.$defs, key => modules.has(key.split(':')[0]))

  for (const schema of Object.values(contextSchemas)) {
    if (typeof schema === 'object' && schema.properties) {
      schema.properties = filterProperties(schema.properties, modules)
    }
  }

  return {
    ...rootSchema,
    properties: filterProperties(rootSchema.properties, modules),
    $comment: `${rootSchema.$comment}\nIncluded modules: ${[...modules].join(', ')}`,
    $defs: {
      ...contextSchemas,
      ...moduleSchemas,
    },
  }
}

/**
 * @param {JSONSchema['properties']} properties
 * @param {ReadonlySet<string>} modules Names of modules to keep in the schema.
 */
function filterProperties(properties, modules) {
  return filterObj(
    properties ?? {},
    (_, value) => typeof value.$ref !== 'string' || modules.has(parseModuleFromRef(value.$ref)),
  )
}

/** @param {string} ref */
function parseModuleFromRef(ref) {
  const [_, match] = ref.match(/^#\/\$defs\/([^/:]+)/) ?? []
  return match
}

/**
 * @param {string} filepath
 * @returns {JSONSchema}
 */
function readJsonSchema(filepath) {
  const content = FS.readFileSync(filepath, 'utf-8')
  return JSON.parse(content)
}

/**
 * @template {Record<string, V>} T
 * @template V
 * @param {T} obj
 * @param {(key: string, value: V) => boolean} pred
 * @returns {T}
 */
function filterObj(obj, pred) {
  // @ts-ignore
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (pred(key, value)) {
      acc[key] = value
    }
    return acc
  }, {})
}

/** @param {JSONSchema} schema */
function extractModuleNames(schema) {
  assert(schema.$defs, 'Missing $defs in schema')

  const modules = new Set(
    Object.keys(schema.$defs)
      .filter(key => !key.startsWith('context:'))
      .map(key => key.split(':')[0]),
  )
  return [...modules]
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const include = new Set()
  const exclude = new Set()
  let action = 'filter'
  let id

  loop: while (argv.length > 0) {
    switch (argv[0]) {
      case '--list-modules':
      case '-l': {
        argv.shift()
        action = 'list'
        break
      }
      case '--include':
      case '-i': {
        argv.shift()
        const arg = argv.shift()
        assert(arg, 'Missing argument for --include')
        for (const name of arg.split(',')) {
          include.add(name)
        }
        break
      }
      case '--id': {
        argv.shift()
        id = argv.shift()
        break
      }
      case '--exclude':
      case '-x': {
        argv.shift()
        const arg = argv.shift()
        assert(arg, 'Missing argument for --exclude')
        for (const name of arg.split(',')) {
          exclude.add(name)
        }
        break
      }
      case '--help':
      case '-h': {
        console.log(HELP)
        process.exit(0)
      }
      case '--': {
        argv.shift()
        break loop
      }
      default:
        if (argv[0].startsWith('-')) {
          console.error(`Unknown option: ${argv[0]}`)
          process.exit(1)
        }
        break loop
    }
  }

  return { args: argv, action, id, include, exclude }
}

/** @param {string[]} argv */
function main(argv) {
  const { action, exclude, id, include } = parseArgs(argv)
  const rootSchema = readJsonSchema(argv[0])

  if (include.size === 0) {
    for (const name of extractModuleNames(rootSchema)) {
      include.add(name)
    }
  }
  const modules = filterModules(include, exclude)

  switch (action) {
    case 'list': {
      console.log([...modules].join('\n'))
      break
    }
    default: {
      const schema = filterSchema(rootSchema, modules)
      const output = JSON.stringify({ ...schema, $id: id }, null, 2)
      console.log(output)
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  main(process.argv.slice(2))
}

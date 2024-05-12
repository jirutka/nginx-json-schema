import * as FS from 'node:fs'
import * as process from 'node:process'

import { DOMParser, type ErrorHandlerObject } from '@xmldom/xmldom'
import * as R from 'rambda'
import { typeFlag } from 'type-flag'

import { generateJsonSchema } from './schemaGenerator.js'
import { processModuleDocument } from './directiveParser.js'

function readXmlDocument(filepath: string): Document {
  const content = FS.readFileSync(filepath, 'utf-8')
  return new DOMParser({ errorHandler: DOMParserErrorHandler }).parseFromString(
    content,
    'application/xml',
  )
}

const DOMParserErrorHandler: ErrorHandlerObject = {
  warning: console.warn,
  error: msg => {
    if (!String(msg).includes('entity not found')) {
      console.error(msg)
    }
  },
  fatalError: msg => {
    throw new Error(msg)
  },
}

function isModuleDocument(doc: Document): boolean {
  return Array.from(doc.childNodes).some(child => child.nodeName === 'module')
}

function main(argv: string[]): void {
  // prettier-ignore
  const { _: args, flags, unknownFlags } = typeFlag({
    comment: {
      type: String,
      alias: 'c',
    },
    out: {
      type: String,
      alias: 'o',
    },
    help: {
      type: Boolean,
      alias: 'h',
    },
  }, argv)

  if (flags.help) {
    console.log(`Usage: generate-schema [-c <comment>] [-o <file>] <module.xml>...`)
    process.exit(0)
  }

  if (!R.isEmpty(unknownFlags)) {
    const unknowns = Object.keys(unknownFlags).map(flag =>
      flag.length > 1 ? `--${flag}` : `-${flag}`,
    )
    throw new Error(`Unknown options: ${unknowns.join(', ')} (see --help)`)
  }

  if (args.length < 1) {
    throw new Error('Missing arguments')
  }

  const directives = args.flatMap(filepath => {
    const doc = readXmlDocument(filepath)
    if (!filepath.endsWith('ngx_http_api_module.xml') && isModuleDocument(doc)) {
      return processModuleDocument(doc)
    }
    return []
  })

  const schema = JSON.stringify(generateJsonSchema(directives, flags.comment || ''), null, 2)

  if (flags.out) {
    FS.writeFileSync(flags.out, schema, 'utf-8')
  } else {
    console.log(schema)
  }
}

try {
  main(process.argv.slice(2))
} catch (err) {
  console.error(err)
  process.exit(1)
}

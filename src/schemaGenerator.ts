import type * as JsonSchemaTyped from 'json-schema-typed/draft-2020-12'
import * as R from 'rambda'

import { groupOrVariants } from './syntaxNodeTokenizer.js'
import type { DirectiveInfo } from './directiveParser.js'
import { sortObjProps } from './utils.js'

type JSONSchema = JsonSchemaTyped.JSONSchema.Interface & {
  markdownDescription?: string
  'x-context'?: string[]
  'x-docUrl'?: string
  'x-module'?: string
  'x-since'?: string
}

const SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

const INTEGER_PATTERN = '^[0-9]+$'
const SIZE_PATTERN = '^[0-9]+[kKmMgG]?$'
const TIME_PATTERN = '^[0-9]+([smhdwMy]|ms)?(\\s+[0-9]+([smhdwMy]|ms)?)*$'

const ValueNameToPattern = new Map(
  Object.entries({
    code: INTEGER_PATTERN,
    connections: SIZE_PATTERN,
    digit: '^[0-9]$',
    factor: '^[0-9]+(.[0-9]+)?$',
    field: '^[^ ]+$',
    length: SIZE_PATTERN,
    letter: '^[a-zA-Z]$',
    levels: '^[0-9]$',
    N: INTEGER_PATTERN,
    number: INTEGER_PATTERN,
    offset: SIZE_PATTERN,
    port: INTEGER_PATTERN,
    rate: SIZE_PATTERN,
    response: '^[0-9]{3}$',
    size: SIZE_PATTERN,
    time: TIME_PATTERN,
    timeout: TIME_PATTERN,
    header_timeout: TIME_PATTERN,
    interval: TIME_PATTERN,
    permissions: '^[rwx]+$',
  } satisfies Record<string, string>),
)

const NumericValueTypes = new Set<string>([
  'code',
  'connections',
  'digit',
  'factor',
  'header_timeout',
  'interval',
  'length',
  'levels',
  'N',
  'number',
  'offset',
  'port',
  'response',
  'size',
  'time',
  'timeout',
])

const directiveRef = (dir: DirectiveInfo) => `#/$defs/${dir.module}:${dir.name}`

const moduleNamespace = (moduleName: string) => moduleName.split('_')[0]

function contextRefId(dir: DirectiveInfo): string {
  const namespace = moduleNamespace(dir.module)
  const id = namespace === 'core' || namespace === dir.name ? dir.name : `${namespace}:${dir.name}`
  return `context:${id}`
}

export function generateJsonSchema(directives: DirectiveInfo[], comment: string): JSONSchema {
  const mainSchema = generateContextSchema(filterDirectivesByContext('main', 'main', directives))
  const contextSchemas = sortObjProps(generateContextSchemas(directives))

  const directiveSchemas = R.pipe(
    R.indexBy<DirectiveInfo>(dir => `${dir.module}:${dir.name}`),
    R.mapObjIndexed(dir => directiveToJsonSchema(dir, contextSchemas)),
    sortObjProps,
  )(directives)

  if (Object.keys(directiveSchemas).length !== directives.length) {
    const set = new Set<string>()
    for (const dir of directives) {
      const id = `${dir.module}:${dir.name}`
      if (set.has(id)) {
        throw new Error(`Found duplicated directive: ${id}`)
      }
      set.add(id)
    }
  }

  return {
    $schema: SCHEMA,
    $comment: comment,
    ...mainSchema,
    $defs: {
      ...contextSchemas,
      ...directiveSchemas,
    },
  }
}

function generateContextSchemas(directives: DirectiveInfo[]): Record<string, JSONSchema> {
  const contextNames = directives.reduce((acc, dir) => {
    for (const context of dir.context) {
      acc.add(context)
    }
    return acc
  }, new Set<string>())

  return directives
    .filter(dir => dir.block && contextNames.has(dir.name))
    .reduce(
      (acc, dir) => {
        const namespace = moduleNamespace(dir.module)
        const directivesInContext = filterDirectivesByContext(namespace, dir.name, directives)
        acc[contextRefId(dir)] = generateContextSchema(directivesInContext)
        return acc
      },
      {} as Record<string, JSONSchema>,
    )
}

function generateContextSchema(directivesInContext: DirectiveInfo[]): JSONSchema {
  return {
    type: 'object',
    properties: R.sortBy($ => $.name, directivesInContext).reduce(
      (acc, d) => {
        acc[d.name] = {
          $ref: directiveRef(d),
        }
        return acc
      },
      {} as Record<string, JSONSchema>,
    ),
  }
}

function directiveToJsonSchema(
  dir: DirectiveInfo,
  contextSchemas: Record<string, JSONSchema>,
): JSONSchema {
  return {
    ...syntaxTokensToJsonSchema(dir, contextSchemas),
    default: dir.default,
    description: dir.docUrl,
    markdownDescription: dir.description,
    'x-context': [...dir.context],
    //'x-docUrl': dir.docUrl,
    'x-module': dir.module,
    'x-since': dir.since,
  }
}

function syntaxTokensToJsonSchema(
  directive: DirectiveInfo,
  contextSchemas: Record<string, JSONSchema>,
): JSONSchema {
  const noParameters = directive.syntax.length < 2 && R.isEmpty(directive.syntax[0])

  if (directive.block) {
    const contextSchemaRefId = contextRefId(directive)

    if (noParameters) {
      return Object.hasOwn(contextSchemas, contextSchemaRefId)
        ? oneOrArraySchema({ $ref: `#/$defs/${contextSchemaRefId}` })
        : oneOrArraySchema({ type: 'object' })
    } else {
      return Object.hasOwn(contextSchemas, contextSchemaRefId)
        ? {
            type: 'object',
            additionalProperties: {
              $ref: `#/$defs/${contextSchemaRefId}`,
            },
          }
        : {
            type: 'object',
            additionalProperties: {
              type: 'object',
            },
          }
    }
  }

  if (noParameters) {
    return { type: 'null' }
  }

  // Optional parameters are too complex, don't generate schema for them.
  // `/[{}]/` is a workaround for perl module.
  if (
    directive.syntax.some(
      R.any(t => t.type === 'LEFT_BRACKET' || (t.type === 'LITERAL' && /[{}]/.test(t.value))),
    )
  ) {
    return {}
  }

  const variants = directive.syntax.flatMap(groupOrVariants)

  let schemas = variants.flatMap<JSONSchema>(tokens => {
    if (tokens.length === 0) {
      return { type: 'null' }
    } else if (tokens.length === 1) {
      const token = tokens[0]

      switch (token.type) {
        case 'LITERAL':
          return { const: token.value }
        case 'VALUE':
          const subSchemas = []
          const pattern = ValueNameToPattern.get(token.name)
          if (pattern) {
            subSchemas.push({ type: 'string', pattern })
          }
          if (NumericValueTypes.has(token.name)) {
            subSchemas.push({ type: 'number' })
          }
          switch (subSchemas.length) {
            case 0:
              return {
                title: token.name,
                type: 'string',
              }
            case 1:
              return {
                title: token.name,
                ...subSchemas[0],
              }
            default:
              return {
                title: token.name,
                anyOf: subSchemas,
              }
          }
        default:
          throw new Error(`Unexpected token type: ${token.type}`)
      }
    } else {
      if (
        tokens.every(
          t =>
            t.type === 'SEPARATOR' ||
            t.type === 'LITERAL' ||
            (t.type === 'VALUE' && ValueNameToPattern.has(t.name)),
        )
      ) {
        const pattern: string = tokens.reduce((str, t) => {
          switch (t.type) {
            case 'SEPARATOR':
              return str + '\\s+'
            case 'LITERAL':
              return str + t.value
            case 'VALUE':
              return str + ValueNameToPattern.get(t.name)!.slice(1, -1)
            default:
              throw new TypeError(`Unexpected token type: ${t.type}`)
          }
        }, '')
        return {
          type: 'string',
          pattern: `^${pattern}$`,
        }
      } else {
        return { type: 'string' }
      }
    }
  })

  let hasOnlyBool = false
  if (schemas.filter(R.has('const')).length > 1) {
    const [constSchemas, otherSchemas] = R.partition(R.has('const'), schemas)

    if (constSchemas.filter($ => $.const === 'on' || $.const === 'off').length === 2) {
      hasOnlyBool = R.isEmpty(otherSchemas)
      otherSchemas.push({ type: 'boolean' })
    }

    otherSchemas.push({ enum: constSchemas.map($ => $.const) })
    schemas = otherSchemas
  }

  if (variants.length === 1 && schemas.length === 1) {
    const tokens = variants[0]

    if (
      tokens.length >= 3 &&
      tokens[0].type === 'VALUE' &&
      tokens[1].type === 'SEPARATOR' &&
      tokens[2].type === 'VALUE'
    ) {
      const keyPattern = ValueNameToPattern.get(tokens[0].name)
      const valuePattern = tokens.length === 3 ? ValueNameToPattern.get(tokens[2].name) : undefined

      const valueSchema = {
        title: tokens[2].name,
        type: 'string',
        pattern: valuePattern,
      } satisfies JSONSchema

      const objSchema: JSONSchema = { type: 'object' }
      if (keyPattern) {
        objSchema.patternProperties = {
          [keyPattern]: valueSchema,
        }
      } else {
        objSchema.additionalProperties = valueSchema
      }

      return {
        anyOf: [
          schemas[0],
          {
            type: 'array',
            items: schemas[0],
          },
          objSchema,
        ],
      }
    }
  }

  if (schemas.length === 1) {
    return oneOrArraySchema(schemas[0])
  } else if (hasOnlyBool) {
    return { anyOf: schemas }
  } else {
    return oneOrArraySchema({
      anyOf: R.uniq(schemas),
    })
  }
}

function filterDirectivesByContext(
  namespace: string,
  context: string,
  directives: DirectiveInfo[],
): DirectiveInfo[] {
  return directives.filter(dir => {
    return (
      (namespace === 'main' ||
        dir.module === 'core' ||
        moduleNamespace(dir.module) === namespace) &&
      (dir.context.has(context) ||
        dir.context.has('any') ||
        (context === 'if' && dir.context.has('if_in_location')))
    )
  })
}

const oneOrArraySchema = (schema: JSONSchema): JSONSchema => ({
  anyOf: [
    schema,
    {
      type: 'array',
      items: schema,
    },
  ],
})

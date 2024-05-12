import assert from 'node:assert/strict'

import * as xpath from 'xpath'

import { descriptionToMarkdown } from './markdown.js'
import { type SyntaxToken, tokenizeSyntaxNode } from './syntaxNodeTokenizer.js'

export interface DirectiveInfo {
  module: string
  name: string
  syntax: SyntaxToken[][]
  block: boolean
  default?: string | number
  context: Set<string>
  description: string
  since?: string
  docUrl: string
}

export function processModuleDocument(doc: Document): DirectiveInfo[] {
  const moduleEl = xpath.select1('//module', doc) as Element | null
  assert(moduleEl, 'Missing "module" element')

  const link = moduleEl.getAttribute('link')
  assert(link, 'Expected "link" attribute in "module" element')

  const moduleName = moduleNameFromLink(link)
  const docUrl = `https://nginx.org${link}`

  const directives = xpath.select('//module/section[@id="directives"]/directive', doc) as Element[]
  assert(Array.isArray(directives), `Expected Array, but got: ${directives}`)

  return directives.map(el => extractDirectiveInfo(el, moduleName, docUrl))
}

function extractDirectiveInfo(el: Element, module: string, moduleDocUrl: string): DirectiveInfo {
  const name = el.getAttribute('name')
  assert(name, 'Missing "name" attribute')

  const syntaxEls = Array.from(el.getElementsByTagName('syntax'))
  assert(syntaxEls.length > 0, 'Missing syntax element')

  const block = syntaxEls.some(e => !!e.getAttribute('block'))

  return {
    module,
    name,
    syntax: syntaxEls.map(tokenizeSyntaxNode),
    block,
    default: block
      ? undefined
      : normalizeDefault(el.getElementsByTagName('default')[0]?.textContent),
    context: new Set(
      Array.from(el.getElementsByTagName('context')).map(el => normalizeContext(el.textContent)),
    ),
    description: descriptionToMarkdown(el.getElementsByTagName('para')),
    since: el.getElementsByTagName('appeared-in')[0]?.textContent ?? undefined,
    docUrl: `${moduleDocUrl}#${name}`,
  }
}

function normalizeContext(context: string | null): string {
  return context ? context.replaceAll(' ', '_') : 'any'
}

function normalizeDefault(value: string | null): string | number | undefined {
  if (value == null) {
    return
  }
  // 8k|16k and similar
  value = value.split('|')[1] || value

  if (/^\d+$/.test(value)) {
    return Number(value)
  }
  return value
}

function moduleNameFromLink(link: string): string {
  const match = link.match(/\/ngx_([^/.]+)_module\./)
  assert(match, `Unexpected module link: ${link}`)

  return match[1]
}

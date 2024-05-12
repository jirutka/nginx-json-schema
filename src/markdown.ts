import assert from 'node:assert/strict'

import type { Node, Nodes } from 'mdast'
import {
  code,
  emphasis,
  inlineCode,
  link,
  list,
  listItem,
  paragraph,
  root,
  strong,
  text,
} from 'mdast-builder'
import { toMarkdown } from 'mdast-util-to-markdown'

export function descriptionToMarkdown(paras: HTMLCollectionOf<Element>): string {
  const tree = root(Array.from(paras).flatMap(elementToMarkdown)) as Nodes

  // XXX: `replaceAll` is a workaround for issues with whitespaces.
  return toMarkdown(tree, { emphasis: '_', fences: true }).replaceAll('&#x20;', '').trim()
}

function elementToMarkdown(el: Element): Node | Node[] {
  const content = el.textContent?.replaceAll(/\n+/g, ' ') ?? ''

  switch (el.nodeName) {
    case '#comment':
      return [] // ignore
    case '#text':
      return content ? text(content) : []
    case 'emphasis':
      return strong(text(content))
    case 'link':
      if (el.hasAttribute('url') && content) {
        return link(el.getAttribute('url')!, undefined, text(content))
      } else if (el.hasAttribute('id')) {
        const id = inlineCode(el.getAttribute('id')!)
        return content ? [emphasis(text(content)), text(' ('), id, text(')')] : id
      } else {
        return text(content)
      }
    case 'c-def':
    case 'c-func':
    case 'command':
    case 'header':
    case 'literal':
    case 'path':
    case 'var':
      return inlineCode(content)
    case 'value':
      return emphasis(inlineCode(content))
    case 'para':
      return paragraphs(elementsToMarkdown(el.childNodes))
    case 'http-status':
      return text(`${el.getAttribute('code')} (${el.getAttribute('text')})`)
    case 'example':
      return code('nginx', el.textContent!.trim())
    case 'note':
      return [] // ignore
    case 'list': {
      switch (el.getAttribute('type')) {
        case 'bullet':
          return list(
            'unordered',
            Array.from(el.getElementsByTagName('listitem')).flatMap(elementToMarkdown),
          )
        case 'enum':
          return list('ordered', elementsToMarkdown(el.getElementsByTagName('listitem')))
        case 'tag':
          return tagListToMarkdown(el)
        default:
          console.warn(`Unsupported list type: ${el.getAttribute('type')}`)
          return [] // ignore
      }
    }
    case 'listitem':
      return listItem(paragraphs(elementsToMarkdown(el.childNodes)))
    default:
      return text(content)
  }
}

function elementsToMarkdown(elements: ArrayLike<ChildNode>): Node[] {
  const elementsArray = Array.from(elements) as Element[]

  elementTrimText('start', elementsArray[0])
  elementTrimText('end', elementsArray.at(-1))

  return elementsArray.flatMap(elementToMarkdown)
}

function elementTrimText(where: 'start' | 'end', el: Element | undefined): void {
  if (el?.textContent) {
    el.textContent = where === 'start' ? el.textContent.trimStart() : el.textContent.trimEnd()
  }
}

function tagListToMarkdown(listEl: Element): Node {
  const items = Array.from(listEl.getElementsByTagName('tag-name')).map(nameEl => {
    let descEl = nameEl
    do {
      descEl = descEl.nextSibling as Element
    } while (descEl?.nodeName !== 'tag-desc')
    assert(descEl, `tag-desc not found for tag-name ${nameEl.textContent}`)

    return listItem([
      paragraph(strong(elementsToMarkdown(nameEl.childNodes))),
      ...paragraphs(elementsToMarkdown(descEl.childNodes)),
    ])
  })

  return list('unordered', items)
}

const BlockNodeTypes = new Set(['paragraph', 'blockquote', 'code', 'heading', 'list'])

function paragraphs(kids: Node[]): Node[] {
  return kids.reduce((acc, node) => {
    const prevNode = acc.at(-1)

    if (BlockNodeTypes.has(node.type)) {
      acc.push(node)
    } else if (prevNode?.type === 'paragraph') {
      assert('children' in prevNode && Array.isArray(prevNode.children))
      prevNode.children.push(node)
    } else {
      acc.push(paragraph(node))
    }
    return acc
  }, [] as Node[])
}

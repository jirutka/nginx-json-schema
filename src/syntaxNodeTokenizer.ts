import assert from 'node:assert/strict'

export type SyntaxToken =
  | { type: 'LEFT_BRACKET' | 'ONE_OR_MORE' | 'OR' | 'RIGHT_BRACKET' | 'SEPARATOR' }
  | { type: 'LITERAL'; value: string }
  | { type: 'VALUE'; name: string }

const TextTokenTypes = {
  ' ': 'SEPARATOR',
  '|': 'OR',
  '[': 'LEFT_BRACKET',
  ']': 'RIGHT_BRACKET',
  '…': 'ONE_OR_MORE',
} as const satisfies Record<string, string>

export function tokenizeSyntaxNode(syntaxNode: Node): SyntaxToken[] {
  const tokens: SyntaxToken[] = []

  for (const child of Array.from(syntaxNode.childNodes)) {
    switch (child.nodeName) {
      case 'literal':
        tokens.push({ type: 'LITERAL', value: child.textContent ?? '' })
        break
      case 'value':
        tokens.push({ type: 'VALUE', name: child.textContent ?? '' })
        break
      case '#text':
        if (/^\n+$/.test(child.textContent ?? '')) {
          continue
        }
        const text = child
          .textContent!.replace(/\s+\|\s+/, '|')
          .replace(/\[\s+/, '[')
          .replace(/\s+\]/, ']')
          .replace(/\s*\.\.\./, '…')
          .replace(/\s+/, ' ')

        let literal = ''
        for (const char of text) {
          if (Object.hasOwn(TextTokenTypes, char)) {
            const type = TextTokenTypes[char as keyof typeof TextTokenTypes]
            if (literal) {
              tokens.push({ type: 'LITERAL', value: literal })
              literal = ''
            }
            if (tokens.length > 0 || type !== 'SEPARATOR') {
              tokens.push({ type })
            }
          } else {
            literal += char
          }
        }
        if (literal) {
          tokens.push({ type: 'LITERAL', value: literal })
        }
        break
      default:
        throw new Error(`Unexpected element: ${child.nodeName}`)
    }
  }

  return tokens
}

export function groupOrVariants(syntaxTokens: SyntaxToken[]): SyntaxToken[][] {
  // prettier-ignore
  return syntaxTokens.reduce((acc, token) => {
    assert(
      token.type !== 'LEFT_BRACKET' && token.type !== 'RIGHT_BRACKET',
      'Bracket syntax is not supported',
    )

    if (token.type === 'OR') {
      acc.push([])
    } else {
      acc.at(-1)!.push(token)
    }
    return acc
  }, [[]] as SyntaxToken[][])
}

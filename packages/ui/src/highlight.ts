export interface Token {
  text: string;
  kind?: string;
}

/** Small display-only lexer. Text stays escaped by the renderer. */
export function highlight(source: string): Token[] {
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\b(?:import|from|export|default|function|return|const|let|type|interface|async|await|if|new|typeof|undefined|true|false|extends|keyof|readonly|unknown|void|never|in|boolean|string|number)\b)|(\b\d+\b)|(\b[A-Za-z_$][\w$]*(?=\s*\())/g;
  const tokens: Token[] = [];
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    tokens.push({ text: source.slice(offset, match.index) });
    const kind = ["string", "comment", "keyword", "number", "function"][
      match.slice(1).findIndex((group) => group !== undefined)
    ];
    tokens.push({ text: match[0], kind });
    offset = match.index + match[0].length;
  }
  tokens.push({ text: source.slice(offset) });
  return tokens;
}

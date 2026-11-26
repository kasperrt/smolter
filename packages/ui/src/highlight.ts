export interface Token {
  text: string;
  kind?: string;
}

const pattern =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\b(?:import|from|export|default|function|return|const|let|type|interface|async|await|if|new|typeof|undefined|true|false|extends|keyof|readonly|unknown|void|never|in|boolean|string|number)\b)|(\b\d+\b)|(\b[A-Za-z_$][\w$]*(?=\s*\())/g;

/** Small display-only lexer. Text stays escaped by the renderer. */
export function highlight(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset)
      tokens.push({ text: source.slice(offset, match.index) });
    const kind = match[1]
      ? "string"
      : match[2]
        ? "comment"
        : match[3]
          ? "keyword"
          : match[4]
            ? "number"
            : "function";
    tokens.push({ text: match[0], kind });
    offset = match.index + match[0].length;
  }
  if (offset < source.length) tokens.push({ text: source.slice(offset) });
  return tokens;
}

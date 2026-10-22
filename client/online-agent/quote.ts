// A message about an opportunity on Insights starts with a link to it on its own line. Both the page and the side
// panel show it as a quote above the question instead of raw Markdown.
const QUOTE = /^\[([^\]\n]+)\]\([^)\s]*opportunities\?item=[^)\s]+\)[ \t]*\n?/;
export function parseQuote(text: string) {
  const match = QUOTE.exec(text);
  return match
    ? { quote: match[1], question: text.slice(match[0].length) }
    : { quote: null, question: text };
}

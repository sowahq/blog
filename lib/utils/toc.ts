import type { MarkdownNode, MarkdownRoot } from '@nuxt/content';

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
  children: TocEntry[];
}

const HEADING_TAG = /^h([1-6])$/;

function nodeText(node: MarkdownNode): string {
  if (node.type === 'text') {
    return node.value ?? '';
  }

  return (node.children ?? []).map(nodeText).join('');
}

function flattenHeadings(nodes: MarkdownNode[], maxDepth: number): TocEntry[] {
  return nodes.flatMap((node) => {
    const match = node.tag?.match(HEADING_TAG);

    if (!match) {
      return node.children?.length ? flattenHeadings(node.children, maxDepth) : [];
    }

    const depth = Number(match[1]);
    const id = node.props?.id;
    const text = nodeText(node).trim();

    if (depth > maxDepth || !id || !text) {
      return [];
    }

    return [{ id, text, depth, children: [] }];
  });
}

function nest(headings: TocEntry[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];

  for (const heading of headings) {
    while (stack.length && stack[stack.length - 1].depth >= heading.depth) {
      stack.pop();
    }

    if (stack.length) {
      stack[stack.length - 1].children.push(heading);
    } else {
      roots.push(heading);
    }

    stack.push(heading);
  }

  return roots;
}

export function buildToc(body?: MarkdownRoot, maxDepth = 3): TocEntry[] {
  if (!body?.children?.length) {
    return [];
  }

  return nest(flattenHeadings(body.children, maxDepth));
}

export function flattenToc(entries: TocEntry[]): TocEntry[] {
  return entries.flatMap((entry) => [entry, ...flattenToc(entry.children)]);
}

import type { FileEntry } from '../types';

export interface TreeNode {
  /** 'src/ui' for folders, full path for files. */
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  fileId: number;
  children: TreeNode[];
  ext: string;
  /** Aggregated lifetime across the subtree, used for the folder bar. */
  firstCommit: number;
  lastCommit: number;
  fileCount: number;
}

function makeNode(path: string, name: string, isDir: boolean, depth: number): TreeNode {
  return {
    path,
    name,
    isDir,
    depth,
    fileId: -1,
    children: [],
    ext: '',
    firstCommit: Number.POSITIVE_INFINITY,
    lastCommit: Number.NEGATIVE_INFINITY,
    fileCount: 0,
  };
}

/**
 * Builds the folder tree from the files' *current* paths. A file that was moved
 * lives at its final location for its whole life; the previous path is shown in
 * the details panel instead of duplicating the row.
 */
export function buildTree(files: readonly FileEntry[]): TreeNode {
  const root = makeNode('', '', true, -1);
  const dirs = new Map<string, TreeNode>([['', root]]);

  for (const file of files) {
    const parts = file.path.split('/');
    let parentPath = '';
    let parent = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const segment = parts[i]!;
      const dirPath = parentPath === '' ? segment : `${parentPath}/${segment}`;
      let dir = dirs.get(dirPath);
      if (!dir) {
        dir = makeNode(dirPath, segment, true, i);
        dirs.set(dirPath, dir);
        parent.children.push(dir);
      }
      parent = dir;
      parentPath = dirPath;
    }
    const leaf = makeNode(file.path, parts[parts.length - 1]!, false, parts.length - 1);
    leaf.fileId = file.id;
    leaf.ext = file.ext;
    const first = file.spans[0]?.[0] ?? 0;
    const last = file.spans[file.spans.length - 1]?.[1] ?? 0;
    leaf.firstCommit = first;
    leaf.lastCommit = last;
    leaf.fileCount = 1;
    parent.children.push(leaf);
  }

  aggregate(root);
  sortTree(root);
  return root;
}

function aggregate(node: TreeNode): void {
  if (!node.isDir) return;
  for (const child of node.children) {
    aggregate(child);
    node.firstCommit = Math.min(node.firstCommit, child.firstCommit);
    node.lastCommit = Math.max(node.lastCommit, child.lastCommit);
    node.fileCount += child.fileCount;
  }
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
  for (const child of node.children) sortTree(child);
}

export interface Layout {
  rows: TreeNode[];
  /** Visible row for each file id, or the row of its collapsed ancestor. */
  rowForFile: Int32Array;
}

export function layoutRows(root: TreeNode, expanded: ReadonlySet<string>, fileCount: number): Layout {
  const rows: TreeNode[] = [];
  const rowForFile = new Int32Array(fileCount).fill(-1);

  const claimSubtree = (node: TreeNode, row: number): void => {
    if (!node.isDir) {
      if (node.fileId >= 0 && node.fileId < fileCount) rowForFile[node.fileId] = row;
      return;
    }
    for (const child of node.children) claimSubtree(child, row);
  };

  const walk = (node: TreeNode): void => {
    for (const child of node.children) {
      const row = rows.length;
      rows.push(child);
      if (child.isDir) {
        if (expanded.has(child.path)) walk(child);
        else claimSubtree(child, row);
      } else if (child.fileId >= 0 && child.fileId < fileCount) {
        rowForFile[child.fileId] = row;
      }
    }
  };

  walk(root);
  return { rows, rowForFile };
}

/**
 * Expands folders breadth-first while the row count stays modest, so a fresh
 * repository shows useful structure without a 10 000-row wall.
 */
export function defaultExpanded(root: TreeNode, maxRows: number): Set<string> {
  const expanded = new Set<string>();
  let rows = root.children.length;
  const queue: TreeNode[] = root.children.filter((n) => n.isDir);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (rows + node.children.length > maxRows) continue;
    expanded.add(node.path);
    rows += node.children.length;
    for (const child of node.children) {
      if (child.isDir) queue.push(child);
    }
  }
  return expanded;
}

export function collectFileIds(node: TreeNode, out: number[] = []): number[] {
  if (!node.isDir) {
    if (node.fileId >= 0) out.push(node.fileId);
    return out;
  }
  for (const child of node.children) collectFileIds(child, out);
  return out;
}

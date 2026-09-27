/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   Smart Diff role grouping. Public surface: the DiffViewer component, the
   DiffCommentApi/DiffFindingApi contracts, and the DiffViewerGroup shape. */
export { DiffViewer, type DiffViewerGroup } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";

"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  File,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  children?: TreeNode[] | null;
}

interface FileTreeProps {
  nodes: TreeNode[];
  onFileClick?: (node: TreeNode) => void;
  selectedPath?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = ["ts", "tsx", "js", "jsx", "mjs", "py", "go", "rs", "java", "cpp", "c", "cs"];
  const textExts = ["md", "txt", "json", "yaml", "yml", "toml", "env"];

  if (codeExts.includes(ext))
    return <FileCode2 size={14} className="text-blue-400 flex-shrink-0" />;
  if (textExts.includes(ext))
    return <FileText size={14} className="text-amber-400 flex-shrink-0" />;
  return <File size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />;
}

function formatSize(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

// ── Single tree node row ───────────────────────────────────────────────────────

function TreeRow({
  node,
  depth,
  onFileClick,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onFileClick?: (n: TreeNode) => void;
  selectedPath?: string;
}) {
  const [open, setOpen] = useState(depth < 1); // auto-expand first level
  const isFolder = node.type === "folder";
  const isSelected = node.path === selectedPath;

  const handleClick = () => {
    if (isFolder) {
      setOpen((o) => !o);
    } else {
      onFileClick?.(node);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-left transition-colors group
          ${isSelected
            ? "bg-blue-500/20 text-blue-300"
            : "hover:bg-white/5 text-[var(--color-text-secondary)]"
          }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        title={node.path}
      >
        {/* Expand / collapse arrow */}
        {isFolder ? (
          <span className="text-[var(--color-text-muted)] flex-shrink-0">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          open ? (
            <FolderOpen size={14} className="text-amber-400 flex-shrink-0" />
          ) : (
            <Folder size={14} className="text-amber-400 flex-shrink-0" />
          )
        ) : (
          fileIcon(node.name)
        )}

        {/* Name */}
        <span className="text-xs truncate flex-1">{node.name}</span>

        {/* Size badge (files only) */}
        {!isFolder && node.size && (
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {formatSize(node.size)}
          </span>
        )}
      </button>

      {/* Children */}
      {isFolder && open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

export function FileTree({ nodes, onFileClick, selectedPath }: FileTreeProps) {
  if (!nodes.length) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] text-center py-8">
        No files to display
      </p>
    );
  }

  return (
    <div className="text-sm font-mono">
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

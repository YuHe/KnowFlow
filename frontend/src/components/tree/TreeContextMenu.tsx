import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface TreeNodeData {
  id: string;
  title: string;
  type: 'folder' | 'doc';
  children?: TreeNodeData[];
  parentId?: string | null;
}

interface TreeContextMenuProps {
  nodeId: string;
  x: number;
  y: number;
  kbId: string;
  tree: TreeNodeData[];
  onClose: () => void;
  onCreateDoc: (parentId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRename: (nodeId: string, newTitle: string) => void;
  onDelete: (nodeId: string) => void;
  onMove: (nodeId: string, targetParentId: string | null) => void;
}

const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  nodeId,
  x,
  y,
  kbId,
  tree,
  onClose,
  onCreateDoc,
  onCreateFolder,
  onRename,
  onDelete,
  onMove,
}) => {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Find current node
  const findNode = (nodes: TreeNodeData[], id: string): TreeNodeData | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  const currentNode = findNode(tree, nodeId);

  useEffect(() => {
    if (showRenameInput && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.value = currentNode?.title || '';
      setRenameValue(currentNode?.title || '');
    }
  }, [showRenameInput]);

  // Adjust menu position to stay within viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 300),
  };

  const flatFolders = (nodes: TreeNodeData[], exclude: string): TreeNodeData[] => {
    return nodes.reduce<TreeNodeData[]>((acc, n) => {
      if (n.id !== exclude && n.type === 'folder') {
        acc.push(n);
        if (n.children) acc.push(...flatFolders(n.children, exclude));
      }
      return acc;
    }, []);
  };
  const folders = flatFolders(tree, nodeId);

  const handleDelete = () => {
    if (window.confirm(`确定要删除"${currentNode?.title || '此项目'}"吗？${currentNode?.type === 'folder' ? '所有子文档也将被删除。' : ''}`)) {
      onDelete(nodeId);
    }
    onClose();
  };

  const handleRenameSubmit = () => {
    const v = renameValue.trim();
    if (v && v !== currentNode?.title) {
      onRename(nodeId, v);
    }
    setShowRenameInput(false);
    onClose();
  };

  const MenuItem: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }> = ({
    onClick, icon, label, danger,
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <div
        ref={menuRef}
        style={menuStyle}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-48"
        onClick={(e) => e.stopPropagation()}
      >
        {showRenameInput ? (
          <div className="px-3 py-2">
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') { setShowRenameInput(false); }
              }}
              className="w-full px-2 py-1.5 text-sm border border-indigo-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-1 mt-2">
              <button onClick={handleRenameSubmit} className="flex-1 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition">确认</button>
              <button onClick={() => setShowRenameInput(false)} className="flex-1 py-1 text-xs border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition">取消</button>
            </div>
          </div>
        ) : (
          <>
            {currentNode?.type === 'doc' && (
              <MenuItem
                onClick={() => { navigate(`/kb/${kbId}/doc/${nodeId}/edit`); onClose(); }}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                label="编辑"
              />
            )}
            {currentNode?.type === 'folder' && (
              <>
                <MenuItem
                  onClick={() => { onCreateDoc(nodeId); onClose(); }}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                  label="新建文档"
                />
                <MenuItem
                  onClick={() => { onCreateFolder(nodeId); onClose(); }}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                  label="新建子目录"
                />
              </>
            )}
            <div className="border-t border-gray-100 my-1" />
            <MenuItem
              onClick={() => { setShowRenameInput(true); }}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
              label="重命名"
            />
            <div className="relative">
              <button
                onMouseEnter={() => setShowMoveSubmenu(true)}
                onMouseLeave={() => setShowMoveSubmenu(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                移动到
                <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              {showMoveSubmenu && (
                <div
                  className="absolute left-full top-0 ml-0.5 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44 z-50"
                  onMouseEnter={() => setShowMoveSubmenu(true)}
                  onMouseLeave={() => setShowMoveSubmenu(false)}
                >
                  <button
                    onClick={() => { onMove(nodeId, null); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    根目录
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => { onMove(nodeId, folder.id); onClose(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition truncate"
                    >
                      <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      <span className="truncate">{folder.title}</span>
                    </button>
                  ))}
                  {folders.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">无可用目录</p>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 my-1" />
            <MenuItem
              onClick={handleDelete}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
              label="删除"
              danger
            />
          </>
        )}
      </div>
    </>
  );
};

export default TreeContextMenu;

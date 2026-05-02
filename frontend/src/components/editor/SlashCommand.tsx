import { Extension } from '@tiptap/core';
import { Editor, Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import tippy, { Instance as TippyInstance } from 'tippy.js';

interface CommandItem {
  title: string;
  description: string;
  icon: string;
  command: (params: { editor: Editor; range: Range }) => void;
}

const getCommandItems = (kbId: string): CommandItem[] => [
  {
    title: '表格',
    description: '插入一个表格',
    icon: '⊞',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: '代码块',
    description: '插入代码块',
    icon: '</>',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: '图片',
    description: '插入图片（URL）',
    icon: '🖼',
    command: ({ editor, range }) => {
      const url = prompt('请输入图片 URL:');
      if (url) {
        editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
      }
    },
  },
  {
    title: '分割线',
    description: '插入水平分割线',
    icon: '—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: '引用',
    description: '插入引用块',
    icon: '"',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: '超链接',
    description: '插入超链接',
    icon: '🔗',
    command: ({ editor, range }) => {
      const url = prompt('请输入链接 URL:');
      if (url) {
        editor.chain().focus().deleteRange(range).setLink({ href: url }).run();
      }
    },
  },
  {
    title: '任务列表',
    description: '插入任务清单',
    icon: '☑',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: '无序列表',
    description: '插入无序列表',
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: '有序列表',
    description: '插入有序列表',
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: '标题 1',
    description: '一级标题',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: '标题 2',
    description: '二级标题',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: '标题 3',
    description: '三级标题',
    icon: 'H3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
];

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((idx) => (idx - 1 + props.items.length) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((idx) => (idx + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = props.items[selectedIndex];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  useEffect(() => setSelectedIndex(0), [props.items]);

  if (props.items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-sm text-gray-400 w-56">
        无匹配命令
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-56 max-h-72 overflow-y-auto z-50">
      {props.items.map((item, index) => (
        <button
          key={item.title}
          onClick={() => props.command(item)}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition ${
            index === selectedIndex ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-xs font-mono flex-shrink-0">
            {item.icon}
          </span>
          <div className="text-left min-w-0">
            <p className="font-medium text-xs">{item.title}</p>
            <p className="text-gray-400 text-xs truncate">{item.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
});

CommandList.displayName = 'CommandList';

interface SlashCommandOptions {
  kbId?: string;
}

const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { kbId: '' };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: any }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          const items = getCommandItems(options.kbId || '');
          return items.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          let component: ReactRenderer;
          let popup: TippyInstance[];

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
              });

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props: any) {
              component.updateProps(props);
              if (!props.clientRect) return;
              popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
            },
            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                popup[0]?.hide();
                return true;
              }
              return (component.ref as any)?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup[0]?.destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});

export default SlashCommand;

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface HeadingItem {
  id: string;
  level: number;
  text: string;
  el?: Element;
}

interface OutlinePanelProps {
  content: string;
  containerRef?: React.RefObject<HTMLDivElement>;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({ content, containerRef }) => {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  const extractHeadings = useCallback(() => {
    // Try extracting from live DOM first (for DocReadPage with containerRef)
    if (containerRef?.current) {
      const els = containerRef.current.querySelectorAll('h1, h2, h3');
      const items: HeadingItem[] = Array.from(els).map((el, i) => {
        const id = el.id || `heading-${i}`;
        if (!el.id) el.id = id;
        return { id, level: parseInt(el.tagName[1]), text: el.textContent || '', el };
      });
      setHeadings(items);
      return;
    }
    // Fallback: parse HTML string
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const els = doc.querySelectorAll('h1, h2, h3');
    const items: HeadingItem[] = Array.from(els).map((el, i) => ({
      id: el.id || `heading-${i}`,
      level: parseInt(el.tagName[1]),
      text: el.textContent || '',
    }));
    setHeadings(items);
  }, [content, containerRef]);

  useEffect(() => {
    extractHeadings();
  }, [extractHeadings]);

  // Intersection observer for active heading highlight
  useEffect(() => {
    if (!containerRef?.current || !headings.length) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    headings.forEach(({ el }) => { if (el) observerRef.current?.observe(el); });
    return () => observerRef.current?.disconnect();
  }, [headings, containerRef]);

  const scrollToHeading = (heading: HeadingItem, index: number) => {
    // Try containerRef DOM first
    if (containerRef?.current) {
      const target = containerRef.current.querySelector<HTMLElement>(`#${heading.id}`) ||
        containerRef.current.querySelectorAll(`h${heading.level}`)[index];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(heading.id);
        return;
      }
    }
    // Fallback to document
    const el = document.getElementById(heading.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(heading.id);
    }
  };

  if (headings.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-gray-400">暂无大纲</p>
      </div>
    );
  }

  const indentClass: Record<number, string> = { 1: 'pl-2', 2: 'pl-5', 3: 'pl-8', 4: 'pl-11' };
  const fontClass: Record<number, string> = {
    1: 'font-semibold text-xs',
    2: 'font-medium text-xs',
    3: 'text-xs',
    4: 'text-xs',
  };

  return (
    <div className="p-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">大纲</p>
      <nav>
        {headings.map((heading, i) => (
          <button
            key={`${heading.id}-${i}`}
            onClick={() => scrollToHeading(heading, i)}
            className={`
              w-full text-left block py-1 px-2 rounded transition leading-snug
              ${indentClass[heading.level] || 'pl-2'}
              ${fontClass[heading.level] || 'text-xs'}
              ${activeId === heading.id
                ? 'text-indigo-700 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }
            `}
            title={heading.text}
          >
            <span className="line-clamp-2">{heading.text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default OutlinePanel;

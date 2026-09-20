import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuItem } from "./pos-types";

export type MenuSection = {
  name: string;
  items: MenuItem[];
};

export function groupMenuSections(
  categories: string[],
  menu: MenuItem[],
): MenuSection[] {
  const active = menu.filter((item) => item.active);
  const buckets = new Map<string, MenuItem[]>();
  for (const name of categories) buckets.set(name, []);
  const extra: MenuItem[] = [];
  for (const item of active) {
    const list = buckets.get(item.category);
    if (list) list.push(item);
    else extra.push(item);
  }
  const sections = categories
    .map((name) => ({ name, items: buckets.get(name) ?? [] }))
    .filter((section) => section.items.length > 0);
  if (extra.length > 0) sections.push({ name: "Other", items: extra });
  return sections;
}

export function useMenuScroll(sectionNames: string[]) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lock = useRef(false);
  const [active, setActive] = useState(sectionNames[0] ?? "");

  useEffect(() => {
    if (!sectionNames.includes(active)) {
      setActive(sectionNames[0] ?? "");
    }
  }, [sectionNames, active]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("[data-menu-section]"),
    ];
    if (nodes.length === 0) return;
    const overflow = root.scrollHeight > root.clientHeight + 4;
    const observer = new IntersectionObserver(
      (entries) => {
        if (lock.current) return;
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const name = hit?.target.getAttribute("data-menu-section");
        if (name) setActive(name);
      },
      {
        root: overflow ? root : null,
        rootMargin: overflow ? "-12% 0px -70% 0px" : "-90px 0px -65% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sectionNames]);

  function go(name: string) {
    const root = scrollerRef.current;
    if (!root) return;
    const target = [...root.querySelectorAll<HTMLElement>("[data-menu-section]")].find(
      (node) => node.dataset.menuSection === name,
    );
    if (!target) return;
    lock.current = true;
    setActive(name);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const nav = document.querySelector<HTMLElement>(
      `[data-cat-nav="${CSS.escape(name)}"]`,
    );
    nav?.scrollIntoView({ block: "nearest", inline: "nearest" });
    window.setTimeout(() => {
      lock.current = false;
    }, 800);
  }

  return { scrollerRef, active, go };
}

export function MenuSectionList({
  sections,
  gridClass,
  renderItem,
}: {
  sections: MenuSection[];
  gridClass: string;
  renderItem: (item: MenuItem) => ReactNode;
}) {
  return (
    <div className="menu-sections">
      {sections.map((section) => (
        <section
          key={section.name}
          data-menu-section={section.name}
          className="menu-section"
          aria-labelledby={`menu-heading-${encodeURIComponent(section.name)}`}
        >
          <h2
            id={`menu-heading-${encodeURIComponent(section.name)}`}
            className="menu-section-title"
          >
            {section.name}
          </h2>
          <div className={gridClass}>
            {section.items.map((item) => renderItem(item))}
          </div>
        </section>
      ))}
    </div>
  );
}

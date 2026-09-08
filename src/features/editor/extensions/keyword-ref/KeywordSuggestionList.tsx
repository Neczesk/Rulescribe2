import { type Ref, useImperativeHandle, useState } from "react";
import type { KeywordSuggestionItem } from "./keywordSuggestion";
import classes from "./KeywordSuggestionList.module.css";

export interface KeywordSuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface KeywordSuggestionListProps {
  items: KeywordSuggestionItem[];
  command: (item: KeywordSuggestionItem) => void;
  ref?: Ref<KeywordSuggestionListHandle>;
}

export function KeywordSuggestionList({ items, command, ref }: KeywordSuggestionListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        command(items[activeIndex]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className={classes.menu}>
        <div className={classes.empty}>No keywords</div>
      </div>
    );
  }

  return (
    <div className={classes.menu}>
      {items.map((item, index) => (
        <button
          type="button"
          key={item.kind === "create" ? "__create" : item.keywordId}
          className={index === activeIndex ? `${classes.row} ${classes.rowActive}` : classes.row}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => command(item)}
        >
          {item.kind === "create" ? `Create “${item.query}”` : item.label}
        </button>
      ))}
    </div>
  );
}

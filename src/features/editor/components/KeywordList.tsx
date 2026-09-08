import { TextInput } from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { IconPlus } from "../../../app/components/icons";
import type { Keyword } from "../../../core/schema/ruleset";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import classes from "./KeywordList.module.css";

interface KeywordListProps {
  keywords: Record<string, Keyword>;
  references: Record<string, string[]>;
  selectedKeywordId?: string;
}

export function KeywordList({ keywords, references, selectedKeywordId }: KeywordListProps) {
  const navigate = useNavigate();
  const paths = useEditorPaths();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();

  const rows = Object.values(keywords)
    .filter((keyword) => (needle ? keyword.displayName.toLowerCase().includes(needle) : true))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const addKeyword = () => {
    const id = currentRulesetStore.getState().addKeyword();
    if (id) navigate(paths.keyword(id));
  };

  return (
    <div>
      <TextInput
        size="xs"
        placeholder="Filter keywords…"
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
        mb="sm"
      />
      {rows.map((keyword) => (
        <Link
          key={keyword.id}
          to={paths.keyword(keyword.id)}
          className={
            keyword.id === selectedKeywordId ? `${classes.row} ${classes.rowActive}` : classes.row
          }
        >
          <span className={classes.name}>{keyword.displayName || "Untitled keyword"}</span>
          <span className={classes.uses}>{references[keyword.id]?.length ?? 0}</span>
        </Link>
      ))}
      {rows.length === 0 && <div className={classes.empty}>No keywords</div>}
      <button type="button" className={classes.newKeyword} onClick={addKeyword}>
        <IconPlus size={12} />
        New keyword
      </button>
    </div>
  );
}

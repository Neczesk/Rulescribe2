import { Link } from "react-router";
import type { TodoRef } from "../../../core/schema/references";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import classes from "./TodoList.module.css";

interface TodoListProps {
  todos: TodoRef[];
}

export function TodoList({ todos }: TodoListProps) {
  const paths = useEditorPaths();
  const open = todos.filter((todo) => !todo.resolved);
  const resolved = todos.filter((todo) => todo.resolved);

  const row = (todo: TodoRef) => (
    <Link
      key={`${todo.articleId}:${todo.todoId}`}
      to={paths.article(todo.articleId)}
      className={todo.resolved ? `${classes.row} ${classes.rowDone}` : classes.row}
    >
      <button
        type="button"
        className={classes.check}
        aria-label={todo.resolved ? "Reopen" : "Resolve"}
        onClick={(event) => {
          event.preventDefault();
          currentRulesetStore
            .getState()
            .setTodoResolved(todo.articleId, todo.todoId, !todo.resolved);
        }}
      >
        {todo.resolved && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4 4 10-10" />
          </svg>
        )}
      </button>
      <span className={classes.body}>
        <span className={classes.text}>{todo.text || "Untitled TODO"}</span>
        <span className={classes.crumb}>{todo.breadcrumb}</span>
      </span>
    </Link>
  );

  return (
    <div>
      <div className={classes.heading}>Open — {open.length}</div>
      {open.map(row)}
      {open.length === 0 && <div className={classes.empty}>Nothing open</div>}

      <div className={classes.heading}>Resolved — {resolved.length}</div>
      {resolved.map(row)}
      {resolved.length === 0 && <div className={classes.empty}>Nothing resolved</div>}
    </div>
  );
}

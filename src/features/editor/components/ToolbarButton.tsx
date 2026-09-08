import { ActionIcon, Button } from "@mantine/core";
import type { ReactNode, Ref } from "react";
import classes from "./ToolbarButton.module.css";

interface ToolbarButtonProps {
  icon?: ReactNode;
  label?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  active?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
  "aria-label": string;
}

export function ToolbarButton({
  icon,
  label,
  bold,
  italic,
  underline,
  active,
  onClick,
  ref,
  ...rest
}: ToolbarButtonProps) {
  const labelClassName = [
    bold && classes.bold,
    italic && classes.italic,
    underline && classes.underline,
  ]
    .filter(Boolean)
    .join(" ");

  const variant = active ? "filled" : "subtle";

  if (label === undefined) {
    return (
      <ActionIcon
        ref={ref}
        variant={variant}
        color="accent"
        className={classes.button}
        onClick={onClick}
        {...rest}
      >
        {icon}
      </ActionIcon>
    );
  }

  return (
    <Button
      ref={ref}
      variant={variant}
      color="accent"
      leftSection={icon}
      className={classes.button}
      classNames={{ label: labelClassName || undefined }}
      onClick={onClick}
      {...rest}
    >
      {label}
    </Button>
  );
}

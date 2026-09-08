import { Badge } from "@mantine/core";
import classes from "./RecentItemRow.module.css";
import { IconChevronRight } from "./icons";

interface RecentItemRowProps {
  name: string;
  tagLabel: string;
  tagVariant: "accent" | "outline";
  meta: string;
  onOpen?: () => void;
}

export function RecentItemRow({ name, tagLabel, tagVariant, meta, onOpen }: RecentItemRowProps) {
  return (
    <button type="button" className={classes.row} onClick={onOpen}>
      <span className={classes.name}>{name}</span>
      <Badge
        color="accent"
        variant={tagVariant === "accent" ? "light" : "outline"}
        radius={0}
        tt="none"
      >
        {tagLabel}
      </Badge>
      <span className={classes.meta}>{meta}</span>
      <span className={classes.chevron}>
        <IconChevronRight />
      </span>
    </button>
  );
}

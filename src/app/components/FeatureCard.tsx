import { Button, Card, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./FeatureCard.module.css";
import { IconPlus } from "./icons";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => void;
  secondaryLabel: string;
  onSecondaryClick?: () => void;
}

export function FeatureCard({
  icon,
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
}: FeatureCardProps) {
  return (
    <Card withBorder className={classes.card}>
      <div className={classes.icon}>{icon}</div>
      <Title order={2} className={classes.title}>
        {title}
      </Title>
      <Text className={classes.description}>{description}</Text>
      <div className={classes.actions}>
        <Button onClick={onPrimaryClick} rightSection={<IconPlus />} style={{ fontWeight: 800 }}>
          {primaryLabel}
        </Button>
        <Button variant="default" onClick={onSecondaryClick} style={{ fontWeight: 800 }}>
          {secondaryLabel}
        </Button>
      </div>
    </Card>
  );
}

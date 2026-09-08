import { ActionIcon, AppShell, Group, Loader } from "@mantine/core";
import { Link, Outlet, useNavigation } from "react-router";
import classes from "./AppLayout.module.css";
import { IconSettings } from "./components/icons";

export function AppLayout() {
  const navigation = useNavigation();

  return (
    <AppShell header={{ height: 60 }}>
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="md" justify="space-between">
          <Link to="/" className={classes.brand}>
            Rulescribe
          </Link>
          <ActionIcon variant="subtle" color="accent" aria-label="Settings">
            <IconSettings />
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Main className={classes.main}>
        {navigation.state === "loading" ? <Loader /> : <Outlet />}
      </AppShell.Main>
    </AppShell>
  );
}

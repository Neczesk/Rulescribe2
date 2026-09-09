import {
  ActionIcon,
  type MantineColorScheme,
  Menu,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { IconMonitor, IconMoon, IconSun } from "./icons";

const OPTIONS: { value: MantineColorScheme; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "auto", label: "System", icon: IconMonitor },
];

/**
 * Light / Dark / System switch. "System" (the default) follows the OS
 * `prefers-color-scheme` live; an explicit choice is remembered by Mantine's
 * ColorSchemeManager (localStorage). Shared shell UI, so it lives in `app/` and
 * is imported by the feature nav bars the same way the icon set already is.
 */
export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const active = OPTIONS.find((o) => o.value === colorScheme) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={150}>
      <Menu.Target>
        <Tooltip label={`Theme: ${active.label}`}>
          <ActionIcon variant="subtle" color="accent" aria-label="Change theme">
            <ActiveIcon />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <Menu.Item
            key={value}
            leftSection={<Icon size={16} />}
            fw={value === colorScheme ? 700 : undefined}
            onClick={() => setColorScheme(value)}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

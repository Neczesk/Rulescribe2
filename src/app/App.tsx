import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { RouterProvider } from "react-router";
import { requestPersistentStorage } from "../core/storage/persistentStorage";
import { initPersistence } from "../core/state/persistence";
import { router } from "./router";
import { theme } from "./theme";

initPersistence();
void requestPersistentStorage();

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <RouterProvider router={router} />
    </MantineProvider>
  );
}

export default App;

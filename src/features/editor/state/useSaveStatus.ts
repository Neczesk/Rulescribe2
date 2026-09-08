import { useStore } from "zustand/react";
import { saveStatusStore } from "../../../core/state/persistence";

export function useSaveStatus() {
  return useStore(saveStatusStore, (state) => state.status);
}

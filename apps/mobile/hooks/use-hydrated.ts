import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
/** Native is immediately ready; static web HTML waits for React event handlers. */
export const useHydrated = () => useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

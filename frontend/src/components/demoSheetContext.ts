import { createContext, useContext } from 'react'

/** Opens the demo controls sheet. Provided by AppShell, used by Home's Demo button. */
export const DemoSheetContext = createContext<() => void>(() => {})
export const useDemoSheet = () => useContext(DemoSheetContext)

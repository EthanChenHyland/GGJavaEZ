import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'

/** Small selector subscriptions; functional updates read the latest committed store. */
export function useStoreField<S, K extends keyof S>(store: StoreApi<S>, key: K): readonly [S[K], Dispatch<SetStateAction<S[K]>>] {
  const value = useStore(store, state => state[key])
  const setValue = useCallback<Dispatch<SetStateAction<S[K]>>>(update => {
    store.setState(state => ({ ...state, [key]: typeof update === 'function' ? (update as (prior: S[K]) => S[K])(state[key]) : update }))
  }, [store, key])
  return [value, setValue] as const
}

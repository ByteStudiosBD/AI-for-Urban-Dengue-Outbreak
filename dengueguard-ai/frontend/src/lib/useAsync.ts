import { useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

/** Runs `fn` whenever `deps` change; ignores stale responses. `fn` returning null skips the call. */
export function useAsync<T>(fn: () => Promise<T> | null, deps: unknown[]): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    const p = fn()
    if (!p) {
      setState({ data: undefined, error: undefined, loading: false })
      return
    }
    setState((s) => ({ data: s.data, error: undefined, loading: true }))
    p.then(
      (data) => alive && setState({ data, error: undefined, loading: false }),
      (error: Error) => alive && setState({ data: undefined, error, loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  return { ...state, retry: () => setNonce((n) => n + 1) }
}

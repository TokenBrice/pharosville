import {
  useQuery,
  type QueryFunctionContext,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import type { PharosVilleApiEndpointKey, PharosVilleApiPayload } from "@shared/types/pharosville";
import { apiFetchWithMeta, type ApiContractMode, type ApiMeta } from "@/lib/api";
import { persistPayloadWhenIdle, readPersistedPayload, refreshRestoredMeta } from "@/lib/world-payload-cache";
import type { ZodType } from "zod";

const DEFAULT_RETRY_DELAY = (attempt: number) => Math.min(1000 * 2 ** attempt, 10000);

type ApiQueryFunction<T> = (
  context?: Pick<QueryFunctionContext<readonly unknown[]>, "signal">,
) => Promise<T>;

interface ApiQueryOptions<T> {
  enabled?: boolean;
  retry?: number | boolean;
  retryDelay?: (attempt: number) => number;
  schema?: ZodType<T>;
  fetchInit?: RequestInit;
  metaMaxAgeSec?: number;
  contractMode?: ApiContractMode;
  /**
   * Opt this query into the last-good payload store. Only the world endpoints
   * set it, and only from inside the lazily-imported desktop chunk, so a
   * viewport that never mounts the world never reads or writes the store.
   */
  persistKey?: PharosVilleApiEndpointKey;
}

function mergeFetchInitSignal(fetchInit: RequestInit | undefined, signal: AbortSignal | undefined): RequestInit | undefined {
  if (!signal) return fetchInit;
  if (!fetchInit) return { signal };
  if (!fetchInit.signal || fetchInit.signal === signal) return { ...fetchInit, signal };
  return { ...fetchInit, signal: AbortSignal.any([fetchInit.signal, signal]) };
}

function getPollingWindow(cronInterval: number) {
  return {
    staleTime: cronInterval,
    refetchInterval: 2 * cronInterval,
  };
}

function createApiQueryFnWithMeta<T>(
  path: string,
  schema?: ZodType<T>,
  fetchInit?: RequestInit,
  metaMaxAgeSec?: number,
  contractMode?: ApiContractMode,
  persistKey?: PharosVilleApiEndpointKey,
): ApiQueryFunction<{ data: T; meta: ApiMeta | null }> {
  return async (context) => {
    const requestInit = mergeFetchInitSignal(fetchInit, context?.signal);
    const result = await apiFetchWithMeta<T>(path, schema, requestInit, metaMaxAgeSec, contractMode);
    if (persistKey) persistPayloadWhenIdle(persistKey, result.data, result.meta);
    return result;
  };
}

/**
 * Bind the last-good store to TanStack's own initial-data slots. Restored data
 * therefore arrives as ordinary query data on the very first render — no
 * separate hydration pass. `initialDataUpdatedAt` reports the moment the entry
 * was STORED rather than now, so nothing downstream can mistake it for a live
 * response.
 *
 * `refetchOnMount: "always"` is what guarantees the refresh. An entry stored a
 * minute ago sits well inside `staleTime`, so left to the normal rules the app
 * would show data it has already labelled stale and then not go and get any —
 * the one outcome worse than the loading sea.
 *
 * The read is memoized per query so `initialData` and `initialDataUpdatedAt`
 * describe the same entry.
 */
function createRestoreOptions<T>(persistKey: PharosVilleApiEndpointKey, metaMaxAgeSec: number) {
  let restored: ReturnType<typeof readPersistedPayload<T>> | undefined;
  const restore = () => {
    if (restored === undefined) restored = readPersistedPayload<T>(persistKey, metaMaxAgeSec);
    return restored;
  };

  return {
    initialData: () => {
      const entry = restore();
      return entry ? { data: entry.data, meta: entry.meta } : undefined;
    },
    initialDataUpdatedAt: () => restore()?.storedAt ?? 0,
    refetchOnMount: "always" as const,
  };
}

function resolveMetaMaxAgeSec<T>(cronInterval: number, opts?: ApiQueryOptions<T>): number {
  return opts?.metaMaxAgeSec ?? Math.max(1, Math.round(cronInterval / 1000));
}

function createApiPollingQueryOptionsWithMeta<T>(
  key: readonly unknown[],
  path: string,
  cronInterval: number,
  opts?: ApiQueryOptions<T>,
): UseQueryOptions<{ data: T; meta: ApiMeta | null }, Error, { data: T; meta: ApiMeta | null }, readonly unknown[]> {
  const metaMaxAgeSec = resolveMetaMaxAgeSec(cronInterval, opts);
  const { staleTime, refetchInterval } = getPollingWindow(cronInterval);

  return {
    queryKey: key,
    queryFn: createApiQueryFnWithMeta(
      path,
      opts?.schema,
      opts?.fetchInit,
      metaMaxAgeSec,
      opts?.contractMode,
      opts?.persistKey,
    ),
    ...(opts?.persistKey ? createRestoreOptions<T>(opts.persistKey, metaMaxAgeSec) : {}),
    staleTime,
    refetchInterval,
    retry: opts?.retry ?? 2,
    retryDelay: opts?.retryDelay ?? DEFAULT_RETRY_DELAY,
    ...(opts?.enabled !== undefined ? { enabled: opts.enabled } : {}),
    // Track only the fields that flow into downstream memoization and render
    // behavior. Omitting `isFetching` prevents background polling ticks from
    // retriggering world computations in the desktop shell.
    notifyOnChangeProps: ["data", "error", "isLoading"],
  };
}

export interface ApiQueryWithMetaResult<T> {
  data: T | undefined;
  meta: ApiMeta | null;
  error: Error | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => Promise<unknown>;
}

export function useApiQueryWithMeta<T>(
  key: readonly unknown[],
  path: string,
  cronInterval: number,
  opts?: ApiQueryOptions<T>,
): ApiQueryWithMetaResult<T> {
  const {
    data,
    error,
    isError,
    isLoading,
    isSuccess,
    refetch,
  } = useQuery<{ data: T; meta: ApiMeta | null }, Error>(
    createApiPollingQueryOptionsWithMeta(key, path, cronInterval, opts),
  );

  return {
    error,
    isError,
    isLoading,
    isSuccess,
    refetch: () => refetch().then(() => {}),
    data: data?.data,
    // Read-time, not fetch-time: while every refetch fails the restored payload
    // stays put, and its age has to keep counting up rather than report the
    // figure it had when the page loaded.
    meta: refreshRestoredMeta(data?.meta ?? null, resolveMetaMaxAgeSec(cronInterval, opts)),
  };
}

export function usePharosVilleEndpointQuery<K extends PharosVilleApiEndpointKey>(
  endpointKey: K,
): ApiQueryWithMetaResult<PharosVilleApiPayload<K>> {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT[endpointKey];
  return useApiQueryWithMeta<PharosVilleApiPayload<K>>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
      persistKey: endpointKey,
    },
  );
}

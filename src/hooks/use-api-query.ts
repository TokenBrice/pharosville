import {
  useQuery,
  type QueryFunctionContext,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetchWithMeta, type ApiContractMode, type ApiMeta } from "@/lib/api";
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
): ApiQueryFunction<{ data: T; meta: ApiMeta | null }> {
  return (context) => {
    const requestInit = mergeFetchInitSignal(fetchInit, context?.signal);
    return apiFetchWithMeta<T>(path, schema, requestInit, metaMaxAgeSec, contractMode);
  };
}

function createApiPollingQueryOptionsWithMeta<T>(
  key: readonly unknown[],
  path: string,
  cronInterval: number,
  opts?: ApiQueryOptions<T>,
): UseQueryOptions<{ data: T; meta: ApiMeta | null }, Error, { data: T; meta: ApiMeta | null }, readonly unknown[]> {
  const metaMaxAgeSec = opts?.metaMaxAgeSec ?? Math.max(1, Math.round(cronInterval / 1000));
  const { staleTime, refetchInterval } = getPollingWindow(cronInterval);

  return {
    queryKey: key,
    queryFn: createApiQueryFnWithMeta(path, opts?.schema, opts?.fetchInit, metaMaxAgeSec, opts?.contractMode),
    staleTime,
    refetchInterval,
    retry: opts?.retry ?? 2,
    retryDelay: opts?.retryDelay ?? DEFAULT_RETRY_DELAY,
    enabled: opts?.enabled,
  };
}

export interface ApiQueryWithMetaResult<T>
  extends Omit<UseQueryResult<{ data: T; meta: ApiMeta | null }, Error>, "data"> {
  data: T | undefined;
  meta: ApiMeta | null;
}

export function useApiQueryWithMeta<T>(
  key: readonly unknown[],
  path: string,
  cronInterval: number,
  opts?: ApiQueryOptions<T>,
): ApiQueryWithMetaResult<T> {
  const { data, ...rest } = useQuery<{ data: T; meta: ApiMeta | null }, Error>(
    createApiPollingQueryOptionsWithMeta(key, path, cronInterval, opts),
  );

  return {
    ...rest,
    data: data?.data,
    meta: data?.meta ?? null,
  };
}

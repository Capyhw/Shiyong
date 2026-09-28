import { useEffect, useState } from "react";
import { DEFAULT_ENDPOINT, fetchCatalog, type CachedCatalog } from "./catalog";
import { getCache, saveCache } from "./store";

export function useCatalog() {
  const endpoint = DEFAULT_ENDPOINT;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    endpoint: string;
    data: CachedCatalog | null;
    loading: boolean;
    error: string;
  }>({ endpoint, data: getCache(endpoint), loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    const cache = getCache(endpoint);
    setState({ endpoint, data: cache, loading: true, error: "" });
    const timeout = window.setTimeout(
      () => controller.abort(new Error("目录请求超时")),
      10000,
    );
    let active = true;
    fetchCatalog(endpoint, cache, controller.signal)
      .then((data) => {
        if (!active) return;
        let error = "";
        try {
          saveCache(endpoint, data);
        } catch {
          error = "本地空间不足，目录未能缓存";
        }
        setState({ endpoint, data, loading: false, error });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          endpoint,
          data: cache,
          loading: false,
          error: error instanceof Error ? error.message : "无法连接目录服务",
        });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [endpoint, attempt]);
  return {
    ...(state.endpoint === endpoint
      ? state
      : { data: getCache(endpoint), loading: true, error: "" }),
    refresh: () => setAttempt((value) => value + 1),
  };
}

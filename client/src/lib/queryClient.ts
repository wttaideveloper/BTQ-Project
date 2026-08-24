import { QueryClient, QueryFunction } from "@tanstack/react-query";

function parseApiErrorMessage(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const body = JSON.parse(text);
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Response body is plain text, not JSON.
  }
  return text;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(parseApiErrorMessage(text, res.statusText || "Request failed"));
  }
}

function isAdminRoute(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isPublicRoute(pathname: string) {
  return (
    pathname === "/auth" ||
    pathname === "/admin/login" ||
    pathname.startsWith("/watch/") ||
    pathname.startsWith("/overlay/") ||
    pathname.startsWith("/championships/") ||
    pathname.startsWith("/championship-teams/")
  );
}

function clearStaleAuthState() {
  queryClient.setQueryData(["/api/user"], null);
  queryClient.setQueryData(["/api/profile"], null);
}

export function handleSessionExpiry(res: Response) {
  if (res.status !== 401 || typeof window === "undefined") {
    return false;
  }

  const { pathname } = window.location;
  if (isPublicRoute(pathname)) {
    return false;
  }

  clearStaleAuthState();
  window.location.replace(isAdminRoute(pathname) ? "/admin/login" : "/auth");
  return true;
}

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
  handleSessionExpiry(res);
  return res;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  handleSessionExpiry(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    handleSessionExpiry(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

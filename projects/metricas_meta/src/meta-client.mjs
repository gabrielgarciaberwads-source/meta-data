import { redactText } from './redact.mjs';

const GRAPH_HOST = 'graph.facebook.com';
const MAX_ATTEMPTS = 3;

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const redact = redactText;

function assertGet(method) {
  if (method !== 'GET') {
    throw new Error(`Meta Graph client only allows GET requests, received ${method}`);
  }
}

function createBaseUrl(graphVersion) {
  if (typeof graphVersion !== 'string' || !/^[A-Za-z0-9._-]+$/.test(graphVersion)) {
    throw new Error('graphVersion must be a non-empty path segment');
  }
  return new URL(`https://${GRAPH_HOST}/${graphVersion}`);
}

function validatePath(path, baseUrl) {
  if (typeof path !== 'string' || !path || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new Error('Meta Graph paths must be relative paths');
  }

  const rawPath = path.split(/[?#]/, 1)[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error('Meta Graph paths must be valid relative paths');
  }
  if (decodedPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Meta Graph paths must stay inside the graph version namespace');
  }

  const relativePath = path.replace(/^\/+/, '');
  const namespace = `${baseUrl.pathname}/`;
  const namespacedPath = relativePath === baseUrl.pathname.slice(1) || relativePath.startsWith(namespace.slice(1))
    ? `/${relativePath}`
    : `${namespace}${relativePath}`;
  const url = new URL(namespacedPath, baseUrl.origin);
  if (url.hostname !== GRAPH_HOST || url.protocol !== 'https:' || url.username || url.password ||
      !(url.pathname === baseUrl.pathname || url.pathname.startsWith(namespace))) {
    throw new Error('Meta Graph paths must stay inside the graph version namespace');
  }
  assertSafeQuery(url.searchParams);
  return url;
}

function validateNext(next, baseUrl) {
  let url;
  try {
    url = new URL(next);
  } catch {
    throw new Error('Meta Graph pagination returned an invalid next URL');
  }

  if (
    url.hostname !== GRAPH_HOST ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/')
  ) {
    throw new Error('Meta Graph pagination returned an untrusted URL');
  }
  assertSafeQuery(url.searchParams);
  return url;
}

function assertSafeQuery(searchParams) {
  for (const key of searchParams.keys()) {
    if (/token/i.test(key)) throw new Error('Meta Graph URLs must not contain token query parameters');
  }
}

function addQuery(url, query) {
  for (const [key, value] of new URLSearchParams(query)) {
    if (/token/i.test(key)) throw new Error('Meta Graph URLs must not contain token query parameters');
    url.searchParams.append(key, value);
  }
  return url;
}

async function responseBody(response) {
  if (typeof response.text === 'function') return response.text();
  if (typeof response.json === 'function') return JSON.stringify(await response.json());
  return '';
}

export function createMetaClient({
  accessToken,
  graphVersion,
  fetchImpl = fetch,
  sleepImpl,
  sleep = sleepImpl,
  retryDelayMs = 250,
} = {}) {
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('accessToken is required');
  const baseUrl = createBaseUrl(graphVersion);
  const wait = sleep ?? defaultSleep;

  async function request(path, { method = 'GET', query } = {}) {
    assertGet(method);
    const url = addQuery(validatePath(path, baseUrl), query ?? {});
    return perform(url, method);
  }

  async function perform(url, method) {
    assertGet(method);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (error) {
        throw new Error(`Meta Graph request failed: ${redact(error?.message ?? error, accessToken)}`);
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch (error) {
          throw new Error(`Meta Graph returned invalid JSON: ${redact(error?.message ?? error, accessToken)}`);
        }
      }

      const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
      if (retryable && attempt < MAX_ATTEMPTS) {
        await wait(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }

      let body;
      try {
        body = await responseBody(response);
      } catch (error) {
        throw new Error(`Meta Graph response body read failed: ${redact(error?.message ?? error, accessToken)}`);
      }
      throw new Error(
        `Meta Graph request failed (${response.status}): ${redact(body, accessToken)}`,
      );
    }
  }

  return {
    get(path, query = {}) {
      const { method = 'GET', ...parameters } = query;
      return request(path, { method, query: parameters });
    },
    async getAll(path, query = {}) {
      const items = [];
      let result = await request(path, { method: 'GET', query });
      items.push(...(Array.isArray(result?.data) ? result.data : []));

      while (result?.paging?.next) {
        result = await perform(validateNext(result.paging.next, baseUrl), 'GET');
        items.push(...(Array.isArray(result?.data) ? result.data : []));
      }
      return items;
    },
  };
}

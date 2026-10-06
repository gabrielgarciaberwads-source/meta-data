import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, isAbsolute, join } from 'node:path';
import { redact } from './redact.mjs';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_TIMEOUT_MS = 30_000;

function localUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be a valid local URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must use a loopback host`);
  }
  return url;
}

function responseUrl(baseUrl, value, label) {
  if (!value) return null;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  if (value.startsWith('file://')) return pathToFileURL(fileURLToPath(value)).toString();
  if (isAbsolute(value) && (process.platform !== 'win32' || /^[A-Za-z]:[\\/]|^\\\\/.test(value))) {
    return pathToFileURL(value).toString();
  }

  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error(`${label} must use a loopback host`);
    }
    return url.toString();
  } catch (error) {
    throw new Error(redact(error.message));
  }
}

function localFile(value) {
  if (value.startsWith('file://')) return fileURLToPath(value);
  if (isAbsolute(value) && (process.platform !== 'win32' || /^[A-Za-z]:[\\/]|^\\\\/.test(value))) return value;
  return null;
}

async function copyExport({ source, outputDir, fileName, fetchImpl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!outputDir) throw new TypeError('outputDir is required');
  if (!source) throw new Error('Presenton response did not include an export path');
  await mkdir(outputDir, { recursive: true });
  const destination = join(outputDir, basename(fileName || 'presentation.pptx'));
  const sourcePath = localFile(source);

  if (sourcePath) {
    await copyFile(sourcePath, destination);
    return destination;
  }

  const url = localUrl(source, 'Presenton export URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { /* response details are optional */ }
      throw new Error(`Presenton export download failed with HTTP ${response.status}: ${detail}`);
    }
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Presenton export download timed out after ${timeoutMs}ms`);
    throw new Error(`Presenton export download failed: ${redact(error?.message ?? error, apiKey)}`);
  } finally {
    clearTimeout(timer);
  }
  return destination;
}

export async function copyPresentonExport({ source, outputDir, fileName, fetchImpl = globalThis.fetch, apiKey, timeoutMs }) {
  return copyExport({ source, outputDir, fileName, fetchImpl, apiKey, timeoutMs });
}

export function createPresentonClient({
  baseUrl,
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const base = localUrl(baseUrl, 'Presenton base URL');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  async function generate({
    content,
    slidesMarkdown,
    instructions,
    language,
    template,
    nSlides = 8,
    exportAs = 'pptx',
    outputDir,
    outputFileName,
  }) {
    if (exportAs !== 'pptx') throw new Error('exportAs must be pptx');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    let response;
    try {
      response = await fetchImpl(new URL('/api/v1/ppt/presentation/generate', base), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content,
          slides_markdown: Array.isArray(slidesMarkdown)
            ? slidesMarkdown
            : [slidesMarkdown].filter(Boolean),
          instructions,
          language,
          template,
          n_slides: nSlides,
          export_as: exportAs,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Presenton request timed out after ${timeoutMs}ms`);
      throw new Error(`Presenton request failed: ${redact(error?.message ?? error, apiKey)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { /* response details are optional */ }
      throw new Error(redact(`Presenton request failed with HTTP ${response.status}: ${detail}`, apiKey));
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(`Presenton returned invalid JSON: ${redact(error?.message ?? error, apiKey)}`);
    }
    if (!result?.presentation_id) throw new Error('Presenton response is missing presentation_id');
    const source = result.path ?? result.file_url;
    const fileUrl = responseUrl(base, source, 'Presenton export path');
    const editUrl = responseUrl(base, result.edit_path ?? result.edit_url, 'Presenton edit path');

    if (outputDir) {
      await copyExport({
        source: localFile(source) ?? fileUrl,
        outputDir,
        fileName: outputFileName || `presentation.${exportAs}`,
        fetchImpl,
        apiKey,
        timeoutMs,
      });
    }
    return { presentationId: result.presentation_id, fileUrl, editUrl };
  }

  return { generate };
}

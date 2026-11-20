export const RESOURCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const RESOURCE_CHUNK_BYTES = 1024 * 1024;
export const RESOURCE_MAX_BATCH = 10;
export const RESOURCE_JSON_BYTES = 64 * 1024;

export const RESOURCE_FORMATS: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel'
};

export class ResourceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'RESOURCE_ERROR') {
    super(message); this.name = 'ResourceError'; this.status = status; this.code = code;
  }
}

export function resourceUuid(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) {
    throw new ResourceError('A valid record identifier is required.');
  }
  return value;
}

export function resourceFilePolicy(name: unknown, size: unknown, mime: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\x00-\x1f/\\]/.test(name)) throw new ResourceError('Choose a valid filename.');
  const extension = name.split('.').pop()?.toLowerCase() || '';
  const expected = RESOURCE_FORMATS[extension];
  if (!expected || (mime && mime !== expected && mime !== 'application/octet-stream')) throw new ResourceError('Use DOCX, XLSX, XLS, PDF, JPG or PNG with its correct file type.');
  if (!Number.isSafeInteger(size) || Number(size) < 1 || Number(size) > RESOURCE_MAX_FILE_BYTES) throw new ResourceError('Files must be between 1 byte and 10 MiB.');
  return { extension, mime: expected, size: Number(size), name };
}

// Inspect the ZIP directory without expanding untrusted Office packages.
export function resourceOfficeDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new ResourceError('The Office file is not a supported ZIP package.');
  const count = view.getUint16(end + 10, true), length = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (!count || count > 5000 || offset + length > end) throw new ResourceError('The Office package exceeds safe preview limits.');
  const names: string[] = []; let cursor = offset, expanded = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new ResourceError('The Office file directory is damaged.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    expanded += view.getUint32(cursor + 24, true);
    if ((flags & 1) || ![0, 8].includes(method) || next > offset + length || expanded > 40 * 1024 * 1024) throw new ResourceError('Encrypted or oversized Office packages are not supported.');
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (/^\/|\\|(^|\/)\.\.(\/|$)/.test(name) || /vbaProject\.bin$/i.test(name)) throw new ResourceError('The Office package contains unsupported active content.');
    names.push(name); cursor = next;
  }
  if (cursor !== offset + length || new Set(names).size !== names.length) throw new ResourceError('The Office file directory is inconsistent.');
  return names;
}

export function validateResourceBytes(name: string, mime: string, bytes: Uint8Array) {
  const policy = resourceFilePolicy(name, bytes.length, mime);
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
  let valid = false;
  if (policy.extension === 'pdf') valid = new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
  if (policy.extension === 'jpg' || policy.extension === 'jpeg') valid = starts([255, 216, 255]);
  if (policy.extension === 'png') valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (policy.extension === 'xls') valid = starts([208, 207, 17, 224, 161, 177, 26, 225]);
  if (policy.extension === 'docx' || policy.extension === 'xlsx') {
    const names = resourceOfficeDirectory(bytes);
    valid = names.includes('[Content_Types].xml') && names.includes(policy.extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml');
  }
  if (!valid) throw new ResourceError('The file contents do not match its selected document type.');
  return policy;
}

export async function resourceBody(request: Pick<Request,'headers'|'body'>, max: number) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new ResourceError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new ResourceError('Request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function resourceJson(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ResourceError('Use a JSON request.', 415);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await resourceBody(request, RESOURCE_JSON_BYTES)));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch (error) { if (error instanceof ResourceError) throw error; throw new ResourceError('Invalid JSON request.'); }
}

export function resourceSafeError(error: unknown) {
  if (error instanceof ResourceError) return error;
  const value = error as {code?: string; message?: string};
  if (value?.code === '28000') return new ResourceError('Your Resources session expired. Verify your account again.', 401, 'SESSION_REQUIRED');
  if (value?.code === '42501') return new ResourceError('Access denied or this record is unavailable.', 403, 'ACCESS_DENIED');
  if (['40001', '23505'].includes(value?.code || '')) return new ResourceError('This record changed. Refresh its current details before saving.', 409, 'CONFLICT');
  if (value?.code === 'P0001' || value?.code === '22023') return new ResourceError(value.message || 'The request is invalid.');
  return new ResourceError('Resources is unavailable. Retry without changing your request.', 503, 'UNAVAILABLE');
}

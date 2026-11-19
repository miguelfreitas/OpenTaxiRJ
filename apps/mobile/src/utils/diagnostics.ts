import { ApiError } from '../api/client';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = /token|password|sms|code|login|email|phone|cpf|document|fullname|displayname/i.test(key)
      ? '<omitido>'
      : redact(item);
  }
  return out;
}

export function formatApiError(cause: unknown, context?: string) {
  const prefix = context ? `${context} • ` : '';
  if (cause instanceof ApiError) {
    let received = '';
    if (typeof cause.body === 'string') {
      received = cause.body.trim().slice(0, 300);
    } else if (cause.body !== undefined && cause.body !== null) {
      try {
        received = JSON.stringify(redact(cause.body)).slice(0, 500);
      } catch {
        received = '<resposta não serializável>';
      }
    }
    return `${prefix}HTTP ${cause.status}${received ? ` • resposta: ${received}` : ''}`;
  }
  return `${prefix}${cause instanceof Error ? cause.message : 'Erro desconhecido'}`;
}

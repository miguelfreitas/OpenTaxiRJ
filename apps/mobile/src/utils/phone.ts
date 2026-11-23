export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function formatPhoneInput(value: string) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length < 3) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length < 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskPhone(value: string) {
  const digits = digitsOnly(value);
  if (digits.length < 11) return formatPhoneInput(digits);
  return `(${digits.slice(0, 2)}) •••••-${digits.slice(-4)}`;
}

export function formatPhoneNumber(value: string | undefined) {
  if (!value) return '';
  const digits = digitsOnly(value);
  if (digits.length === 0 || digits.length > 11) return value;
  return digits.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
}

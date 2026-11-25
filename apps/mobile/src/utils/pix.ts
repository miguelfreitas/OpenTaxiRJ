const PIX_GUI = 'br.gov.bcb.pix';
const PIX_MERCHANT_NAME = 'RECEBEDOR';
const PIX_MERCHANT_CITY = 'RIO DE JANEIRO';
const PIX_TXID = '***';

function emvField(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function toPixPhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 13 && digits.startsWith('55')) return `+${digits}`;
  return null;
}

type StaticPixInput = {
  phoneKey: string;
  amount: number;
};

export function buildStaticPixPayload({
  phoneKey,
  amount,
}: StaticPixInput): string | null {
  if (!/^\+55\d{11}$/.test(phoneKey)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountText = (Math.round(amount * 100) / 100).toFixed(2);
  if (amountText === '0.00') return null;

  const merchantAccount = emvField('00', PIX_GUI) + emvField('01', phoneKey);
  const additionalData = emvField('05', PIX_TXID);
  const partial =
    emvField('00', '01') +
    emvField('01', '11') +
    emvField('26', merchantAccount) +
    emvField('52', '0000') +
    emvField('53', '986') +
    emvField('54', amountText) +
    emvField('58', 'BR') +
    emvField('59', PIX_MERCHANT_NAME) +
    emvField('60', PIX_MERCHANT_CITY) +
    emvField('62', additionalData);
  const withCrc = `${partial}6304`;
  return `${withCrc}${crc16CcittFalse(withCrc)}`;
}

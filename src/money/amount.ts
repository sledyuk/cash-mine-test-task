// Money is handled as bigint "units" (amount * 10^decimals) end to end.
// Strings from the API are parsed straight into units, never through Number,
// because ETH has 18 decimals and floats lose precision well before that.

const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d+)?$/;
const SIGNED_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export type AmountError = 'empty' | 'format' | 'too_many_decimals';

export type ParseResult = { ok: true; units: bigint } | { ok: false; error: AmountError };

/** Strict parser for user input, following the API rules ("0.5", "12"; not ".5", "1.", "05", "1e-3"). */
export function parseAmount(input: string, decimals: number): ParseResult {
  // Phone keyboards in many locales only offer a comma as decimal separator.
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return { ok: false, error: 'empty' };
  if (!AMOUNT_RE.test(normalized)) return { ok: false, error: 'format' };

  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) return { ok: false, error: 'too_many_decimals' };

  return { ok: true, units: BigInt(whole + fraction.padEnd(decimals, '0')) };
}

/** Parses a (possibly signed) amount string coming from the API. Throws on malformed input. */
export function toUnits(value: string, decimals: number): bigint {
  if (!SIGNED_RE.test(value)) throw new Error(`Invalid amount from API: "${value}"`);
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount "${value}" has more than ${decimals} decimals`);
  }
  const units = BigInt(whole + fraction.padEnd(decimals, '0'));
  return negative ? -units : units;
}

/** Formats units back to the API's canonical string form (no trailing zeros). */
export function formatUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const digits = abs.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Number of decimal places written in a decimal string. */
function scaleOf(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/** USD value in cents, rounded half up once at the end. */
export function toUsdCents(units: bigint, decimals: number, usdPrice: string): bigint {
  const priceScale = scaleOf(usdPrice);
  const priceUnits = toUnits(usdPrice, priceScale);
  const numerator = units * priceUnits * 100n;
  const denominator = 10n ** BigInt(decimals + priceScale);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

export function formatUsd(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${rest}`;
}

export type ClaimRules = {
  decimals: number;
  minAmount: string;
  fee: string;
  /** Units the user can claim right now (already net of claims this app knows about). */
  available: bigint;
};

export type ClaimValidationError =
  AmountError | 'zero' | 'below_min' | 'above_available' | 'not_above_fee';

export type ClaimQuote =
  | { ok: true; amount: bigint; fee: bigint; receive: bigint }
  | { ok: false; error: ClaimValidationError };

/** Validates a claim amount against the API rules and computes fee and receive amount. */
export function quoteClaim(input: string, rules: ClaimRules): ClaimQuote {
  const parsed = parseAmount(input, rules.decimals);
  if (!parsed.ok) return parsed;

  const amount = parsed.units;
  const min = toUnits(rules.minAmount, rules.decimals);
  const fee = toUnits(rules.fee, rules.decimals);

  if (amount === 0n) return { ok: false, error: 'zero' };
  if (amount < min) return { ok: false, error: 'below_min' };
  if (amount > rules.available) return { ok: false, error: 'above_available' };
  // The fee comes out of the claimed amount, so the user must receive something.
  if (amount <= fee) return { ok: false, error: 'not_above_fee' };

  return { ok: true, amount, fee, receive: amount - fee };
}

export function claimErrorMessage(
  error: ClaimValidationError,
  rules: Pick<ClaimRules, 'decimals' | 'minAmount' | 'fee'>,
  asset: string,
): string {
  switch (error) {
    case 'empty':
      return 'Enter an amount.';
    case 'format':
      return 'Use digits with an optional decimal point, e.g. 0.5 or 12.';
    case 'too_many_decimals':
      return `${asset} allows at most ${rules.decimals} decimal places.`;
    case 'zero':
      return 'Amount must be greater than 0.';
    case 'below_min':
      return `Minimum claim is ${rules.minAmount} ${asset}.`;
    case 'above_available':
      return 'Amount is more than your available balance.';
    case 'not_above_fee':
      return `Amount must be more than the ${rules.fee} ${asset} fee.`;
  }
}

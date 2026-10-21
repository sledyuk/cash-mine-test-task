import {
  formatUnits,
  formatUsd,
  parseAmount,
  quoteClaim,
  toUnits,
  toUsdCents,
  type ClaimRules,
} from '../amount';

describe('parseAmount', () => {
  it.each([
    ['0.5', 18, 500000000000000000n],
    ['12', 6, 12000000n],
    ['0', 8, 0n],
    [' 1.25 ', 2, 125n],
    ['0,5', 1, 5n],
  ])('parses %p with %p decimals', (input, decimals, units) => {
    expect(parseAmount(input, decimals)).toEqual({ ok: true, units });
  });

  it.each(['.5', '1.', '05', '1e-3', '-1', '1.2.3', 'abc', '+1', '0x10'])(
    'rejects %p as format error',
    (input) => {
      expect(parseAmount(input, 8)).toEqual({ ok: false, error: 'format' });
    },
  );

  it('rejects empty input', () => {
    expect(parseAmount('  ', 8)).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects more decimals than the asset allows', () => {
    expect(parseAmount('0.1234567', 6)).toEqual({ ok: false, error: 'too_many_decimals' });
    expect(parseAmount('0.123456', 6).ok).toBe(true);
  });
});

describe('toUnits / formatUnits', () => {
  it('keeps full 18-decimal precision that floats would lose', () => {
    const value = '12.345678901234591676';
    const units = toUnits(value, 18);
    expect(units).toBe(12345678901234591676n);
    expect(formatUnits(units, 18)).toBe(value);
  });

  it('handles signed values and trims trailing zeros', () => {
    expect(toUnits('-0.5', 8)).toBe(-50000000n);
    expect(formatUnits(-50000000n, 8)).toBe('-0.5');
    expect(formatUnits(12000000n, 6)).toBe('12');
    expect(formatUnits(1n, 8)).toBe('0.00000001');
    expect(formatUnits(0n, 6)).toBe('0');
  });

  it('round-trips canonical strings', () => {
    for (const s of ['0', '0.00000001', '820.413207', '50.12', '67312.45']) {
      expect(formatUnits(toUnits(s, 8), 8)).toBe(s);
    }
  });

  it('throws on malformed API values', () => {
    expect(() => toUnits('1e-3', 8)).toThrow();
    expect(() => toUnits('0.123', 2)).toThrow();
  });
});

describe('USD totals', () => {
  it('converts with the price precision and rounds half up to cents', () => {
    // 820.413207 USDT * 1.0002 = 820.5772896... -> $820.58
    expect(toUsdCents(toUnits('820.413207', 6), 6, '1.0002')).toBe(82058n);
    // 0.01234567 BTC * 67312.45 = 831.0177... -> $831.02
    expect(toUsdCents(toUnits('0.01234567', 8), 8, '67312.45')).toBe(83102n);
    // exactly half a cent rounds up
    expect(toUsdCents(toUnits('0.005', 3), 3, '1')).toBe(1n);
  });

  it('sums assets without float drift', () => {
    const total =
      toUsdCents(toUnits('820.413207', 6), 6, '1.0002') +
      toUsdCents(toUnits('0.01234567', 8), 8, '67312.45') +
      toUsdCents(toUnits('12.345678901234591676', 18), 18, '2461.08');
    expect(formatUsd(total)).toBe('$32,035.30');
  });

  it('formats cents with grouping', () => {
    expect(formatUsd(123456789n)).toBe('$1,234,567.89');
    expect(formatUsd(5n)).toBe('$0.05');
    expect(formatUsd(-150n)).toBe('-$1.50');
  });
});

describe('quoteClaim', () => {
  const eth: ClaimRules = {
    decimals: 18,
    minAmount: '0.01',
    fee: '0.0012',
    available: toUnits('12.345678901234591676', 18),
  };

  it('computes fee and receive amount for a valid claim', () => {
    const quote = quoteClaim('0.5', eth);
    expect(quote).toEqual({
      ok: true,
      amount: toUnits('0.5', 18),
      fee: toUnits('0.0012', 18),
      receive: toUnits('0.4988', 18),
    });
  });

  it('accepts exactly the minimum and exactly the available amount (Max)', () => {
    expect(quoteClaim('0.01', eth).ok).toBe(true);
    expect(quoteClaim(formatUnits(eth.available, 18), eth).ok).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['.5', 'format'],
    ['0', 'zero'],
    ['0.009', 'below_min'],
    ['12.345678901234591677', 'above_available'],
    ['0.0000000000000000001', 'too_many_decimals'],
  ])('rejects %p with %p', (input, error) => {
    expect(quoteClaim(input, eth)).toEqual({ ok: false, error });
  });

  it('rejects amounts that do not exceed the fee', () => {
    const rules = { ...eth, minAmount: '0.001' };
    expect(quoteClaim('0.0012', rules)).toEqual({ ok: false, error: 'not_above_fee' });
    expect(quoteClaim('0.0013', rules).ok).toBe(true);
  });
});

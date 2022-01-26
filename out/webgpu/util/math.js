/**
* AUTO-GENERATED - DO NOT EDIT. Source: https://github.com/gpuweb/cts
**/import { assert } from '../../common/util/util.js';import { kBit } from '../shader/execution/builtin/builtin.js';
import { f32, f32Bits } from './conversion.js';

/**
                                                 * A multiple of 8 guaranteed to be way too large to allocate (just under 8 pebibytes).
                                                 * This is a "safe" integer (ULP <= 1.0) very close to MAX_SAFE_INTEGER.
                                                 *
                                                 * Note: allocations of this size are likely to exceed limitations other than just the system's
                                                 * physical memory, so test cases are also needed to try to trigger "true" OOM.
                                                 */
export const kMaxSafeMultipleOf8 = Number.MAX_SAFE_INTEGER - 7;

/** Round `n` up to the next multiple of `alignment` (inclusive). */
// MAINTENANCE_TODO: Rename to `roundUp`
export function align(n, alignment) {
  assert(Number.isInteger(n) && n >= 0, 'n must be a non-negative integer');
  assert(Number.isInteger(alignment) && alignment > 0, 'alignment must be a positive integer');
  return Math.ceil(n / alignment) * alignment;
}

/** Round `n` down to the next multiple of `alignment` (inclusive). */
export function roundDown(n, alignment) {
  assert(Number.isInteger(n) && n >= 0, 'n must be a non-negative integer');
  assert(Number.isInteger(alignment) && alignment > 0, 'alignment must be a positive integer');
  return Math.floor(n / alignment) * alignment;
}

/** Clamp a number to the provided range. */
export function clamp(n, { min, max }) {
  assert(max >= min);
  return Math.min(Math.max(n, min), max);
}

/**
   * @returns the Units of Last Place difference between the numbers a and b.
   * If either `a` or `b` are not finite numbers, then diffULP() returns Infinity.
   */
export function diffULP(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Infinity;
  }

  const arr = new Uint32Array(new Float32Array([a, b]).buffer);
  const u32_a = arr[0];
  const u32_b = arr[1];

  const sign_a = (u32_a & 0x80000000) !== 0;
  const sign_b = (u32_b & 0x80000000) !== 0;
  const masked_a = u32_a & 0x7fffffff;
  const masked_b = u32_b & 0x7fffffff;
  const subnormal_or_zero_a = (u32_a & 0x7f800000) === 0;
  const subnormal_or_zero_b = (u32_b & 0x7f800000) === 0;

  // If the number is subnormal, then reduce it to 0 for ULP comparison.
  // If the number is normal then reduce its bits-representation so to that we
  // can pretend that the subnormal numbers don't exist, for the purposes of
  // counting ULP steps from zero (or any subnormal) to any of the normal numbers.
  const bits_a = subnormal_or_zero_a ? 0 : masked_a - 0x7fffff;
  const bits_b = subnormal_or_zero_b ? 0 : masked_b - 0x7fffff;

  if (sign_a === sign_b) {
    return Math.max(bits_a, bits_b) - Math.min(bits_a, bits_b);
  }
  return bits_a + bits_b;
}

/**
   * @returns 0 if |val| is a subnormal f32 number, otherwise returns |val|
   */
function flushSubnormalNumber(val) {
  const u32_val = new Uint32Array(new Float32Array([val]).buffer)[0];
  return (u32_val & 0x7f800000) === 0 ? 0 : val;
}

/**
   * @returns 0 if |val| is a bit field for a subnormal f32 number, otherwise
   * returns |val|
   * |val| is assumed to be a u32 value representing a f32
   */
function flushSubnormalBits(val) {
  return (val & 0x7f800000) === 0 ? 0 : val;
}

/**
   * @returns 0 if |val| is a subnormal f32 number, otherwise returns |val|
   */
function flushSubnormalScalar(val) {
  if (val.type.kind !== 'f32') {
    return val;
  }

  const u32_val = new Uint32Array(new Float32Array([val.value.valueOf()]).buffer)[0];
  return (u32_val & 0x7f800000) === 0 ? f32(0) : val;
}

/**
   * @returns the next single precision floating point value after |val|,
   * towards +inf if |dir| is true, otherwise towards -inf.
   * If |flush| is true, all subnormal values will be flushed to 0,
   * before processing.
   * If |flush| is false, the next subnormal will be calculated when appropriate,
   * and for -/+0 the nextAfter will be the closest subnormal in the correct
   * direction.
   * |val| must be expressible as a f32.
   */
export function nextAfter(val, dir = true, flush) {
  if (Number.isNaN(val)) {
    return f32Bits(kBit.f32.nan.positive.s);
  }

  if (val === Number.POSITIVE_INFINITY) {
    return f32Bits(kBit.f32.infinity.positive);
  }

  if (val === Number.NEGATIVE_INFINITY) {
    return f32Bits(kBit.f32.infinity.negative);
  }

  val = flush ? flushSubnormalNumber(val) : val;

  // -/+0 === 0 returns true
  if (val === 0) {
    if (dir) {
      return flush ? f32Bits(kBit.f32.positive.min) : f32Bits(kBit.f32.subnormal.positive.min);
    } else {
      return flush ? f32Bits(kBit.f32.negative.max) : f32Bits(kBit.f32.subnormal.negative.max);
    }
  }

  // number is float64 internally, so need to test if value is expressible as a float32.
  const converted = new Float32Array([val])[0];
  assert(val === converted, `${val} is not expressible as a f32.`);

  const u32_val = new Uint32Array(new Float32Array([val]).buffer)[0];
  const is_positive = (u32_val & 0x80000000) === 0;
  let result = u32_val;
  if (dir === is_positive) {
    result += 1;
  } else {
    result -= 1;
  }
  result = flush ? flushSubnormalBits(result) : result;

  // Checking for overflow
  if ((result & 0x7f800000) === 0x7f800000) {
    if (dir) {
      return f32Bits(kBit.f32.infinity.positive);
    } else {
      return f32Bits(kBit.f32.infinity.negative);
    }
  }
  return f32Bits(result);
}

/**
   * @returns if a test value is correctly rounded to an target value. Only
   * defined for |test_values| being a float32. target values may be any number.
   *
   * Correctly rounded means that if the target value is precisely expressible
   * as a float32, then |test_value| === |target|.
   * Otherwise |test_value| needs to be either the closest expressible number
   * greater or less than |target|.
   *
   * By default internally tests with both subnormals being flushed to 0 and not
   * being flushed, but |accept_to_zero| and |accept_no_flush| can be used to
   * control that behaviour. At least one accept flag must be true.
   */
export function correctlyRounded(
test_value,
target,
accept_to_zero = true,
accept_no_flush = true)
{
  assert(
  accept_to_zero || accept_no_flush,
  `At least one of |accept_to_zero| & |accept_no_flush| must be true`);


  let result = false;
  if (accept_to_zero) {
    result = result || correctlyRoundedImpl(test_value, target, true);
  }
  if (accept_no_flush) {
    result = result || correctlyRoundedImpl(test_value, target, false);
  }
  return result;
}

function correctlyRoundedImpl(test_value, target, flush) {
  assert(test_value.type.kind === 'f32', `${test_value} is expected to be a 'f32'`);

  if (Number.isNaN(target)) {
    return Number.isNaN(test_value.value.valueOf());
  }

  if (target === Number.POSITIVE_INFINITY) {
    return test_value.value === f32Bits(kBit.f32.infinity.positive).value;
  }

  if (target === Number.NEGATIVE_INFINITY) {
    return test_value.value === f32Bits(kBit.f32.infinity.negative).value;
  }

  test_value = flush ? flushSubnormalScalar(test_value) : test_value;
  target = flush ? flushSubnormalNumber(target) : target;

  const target32 = new Float32Array([target])[0];
  const converted = target32;
  if (target === converted) {
    // expected is precisely expressible in float32
    return test_value.value === f32(target32).value;
  }

  let after_target;
  let before_target;

  if (converted > target) {
    // target32 is rounded towards +inf, so is after_target
    after_target = f32(target32);
    before_target = nextAfter(target32, false, flush);
  } else {
    // target32 is rounded towards -inf, so is before_target
    after_target = nextAfter(target32, true, flush);
    before_target = f32(target32);
  }

  return test_value.value === before_target.value || test_value.value === after_target.value;
}
//# sourceMappingURL=math.js.map
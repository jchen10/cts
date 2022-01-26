/**
* AUTO-GENERATED - DO NOT EDIT. Source: https://github.com/gpuweb/cts
**/export const description = `
Execution Tests for the 'inverseSqrt' builtin function
`;import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { assert } from '../../../../common/util/util.js';
import { GPUTest } from '../../../gpu_test.js';
import { f32, f32Bits, TypeF32, u32 } from '../../../util/conversion.js';

import { kBit, run, ulpThreshold } from './builtin.js';

export const g = makeTestGroup(GPUTest);

/**
                                          * Calculates the linear interpolation between two values of a given fractional.
                                          *
                                          * Assumes |min| <= |max|, they are internally swapped if needed.
                                          * If |t| >= 1, then |max| is returned, and if |t| <= 0 |min| is returned.
                                          * Numerical stability is adapted from http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0811r2.html
                                          */
function lerp(min, max, t) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(t)) {
    return Number.NaN;
  }

  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }

  if (t <= 0) {
    return min;
  }

  if (t >= 1) {
    return max;
  }

  if (min === max) {
    return min;
  }

  // Don't need the min >= && max <= 0 case, since min < max is already enforced.
  if (min <= 0 && max >= 0) {
    return t * max + (1 - t) * min;
  }

  const x = min + t * (max - min);
  // t is on (0, 1) here, and min < max, so only need the Math.min() case
  return Math.min(max, x);
}

/** Unwrap Scalar params into numbers and check preconditions */
function unwrapRangeParams(min, max, num_steps) {
  assert(min.type.kind === 'f32', '|min| needs to be a f32');
  assert(max.type.kind === 'f32', '|max| needs to be a f32');
  assert(num_steps.type.kind === 'u32', '|num_steps| needs to be a u32');

  const f32_min = min.value;
  const f32_max = max.value;
  const u32_num_steps = num_steps.value;

  assert(f32_max > f32_min, '|max| must be greater than |min|');
  assert(u32_num_steps > 0, '|num_steps| must be greater than 0');

  return { f32_min, f32_max, u32_num_steps };
}

/** Generate linear range of numbers. */
function linearRange(min, max, num_steps) {
  const { f32_min, f32_max, u32_num_steps } = unwrapRangeParams(min, max, num_steps);

  return Array.from(Array(u32_num_steps).keys()).map((i) =>
  lerp(f32_min, f32_max, i / (u32_num_steps - 1)));

}

/**
   * Generate non-linear range of numbers, with a bias towards min.
   *
   * Generates a linear range on [0,1] with |num_steps|, then squares all the values to make the curve be quadratic,
   * thus biasing towards 0, but remaining on the [0, 1] range.
   * This biased range is then scaled to the desired range using lerp.
   * Different curves could be generated by changing c, where greater values of c will bias more towards 0.
   * */
function biasedRange(min, max, num_steps) {
  const c = 2;
  const { f32_min, f32_max, u32_num_steps } = unwrapRangeParams(min, max, num_steps);

  return Array.from(Array(u32_num_steps).keys()).map((i) =>
  lerp(f32_min, f32_max, Math.pow(lerp(0, 1, i / (u32_num_steps - 1)), c)));

}

g.test('float_builtin_functions,inverseSqrt').
uniqueId('84fc180ad82c5618').
specURL('https://www.w3.org/TR/2021/WD-WGSL-20210929/#float-builtin-functions').
desc(
`
inverseSqrt:
T is f32 or vecN<f32> inverseSqrt(e: T ) -> T Returns the reciprocal of sqrt(e). Component-wise when T is a vector. (GLSLstd450InverseSqrt)

Please read the following guidelines before contributing:
https://github.com/gpuweb/cts/blob/main/docs/plan_autogen.md
`).

params((u) =>
u.
combine('storageClass', ['uniform', 'storage_r', 'storage_rw']).
combine('vectorize', [undefined, 2, 3, 4])).

fn(async t => {
  // [1]: Need to decide what the ground-truth is.
  const truthFunc = x => {
    return { input: f32(x), expected: f32(1 / Math.sqrt(x)) };
  };

  // Well defined cases
  let cases = [
  { input: f32Bits(kBit.f32.infinity.positive), expected: f32(0) },
  { input: f32(1), expected: f32(1) }];


  // 0 < x <= 1 linearly spread
  cases = cases.concat(
  linearRange(f32Bits(kBit.f32.positive.min), f32(1), u32(100)).map(x => truthFunc(x)));

  // 1 <= x < 2^32, biased towards 1
  cases = cases.concat(biasedRange(f32(1), f32(2 ** 32), u32(1000)).map(x => truthFunc(x)));

  const cfg = t.params;
  cfg.cmpFloats = ulpThreshold(2);
  run(t, 'inverseSqrt', [TypeF32], TypeF32, cfg, cases);
});
//# sourceMappingURL=inversesqrt.spec.js.map
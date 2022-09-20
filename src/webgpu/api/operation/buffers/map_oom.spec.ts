export const description =
  'Test out-of-memory conditions creating large mappable/mappedAtCreation buffers.';

import { kUnitCaseParamsBuilder } from '../../../../common/framework/params_builder.js';
import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { kBufferUsages } from '../../../capability_info.js';
import { GPUTest } from '../../../gpu_test.js';
import { kMaxSafeMultipleOf8 } from '../../../util/math.js';

const oomAndSizeParams = kUnitCaseParamsBuilder
  .combine('oom', [false, true])
  .expand('size', ({ oom }) => {
    return oom
      ? [
          kMaxSafeMultipleOf8,
          0x20_0000_0000, // 128 GB
        ]
      : [16];
  });

export const g = makeTestGroup(GPUTest);

g.test('mapAsync')
  .desc(
    `Test creating a large mappable buffer should produce an out-of-memory error if allocation fails.
  - The resulting buffer is an error buffer, so mapAsync rejects and produces a validation error.
  - Calling getMappedRange should throw an OperationError because the buffer is not in the mapped state.
  - unmap() throws an OperationError if mapping failed, and otherwise should detach the ArrayBuffer.
`
  )
  .params(
    oomAndSizeParams //
      .beginSubcases()
      .combine('write', [false, true])
  )
  .fn(async t => {
    const { oom, write, size } = t.params;

    const buffer = t.expectGPUError(
      'out-of-memory',
      () =>
        t.device.createBuffer({
          size,
          usage: write ? GPUBufferUsage.MAP_WRITE : GPUBufferUsage.MAP_READ,
        }),
      oom
    );
    const promise = t.expectGPUError(
      'validation', // Should be a validation error since the buffer is invalid.
      () => buffer.mapAsync(write ? GPUMapMode.WRITE : GPUMapMode.READ),
      oom
    );

    if (oom) {
      // Should also reject in addition to the validation error.
      t.shouldReject('OperationError', promise);

      // Should throw an OperationError because the buffer is not mapped.
      // Note: not a RangeError because the state of the buffer is checked first.
      t.shouldThrow('OperationError', () => {
        buffer.getMappedRange();
      });

      // Should be a validation error since the buffer failed to be mapped.
      t.expectGPUError('validation', () => buffer.unmap());
    } else {
      await promise;
      const arraybuffer = buffer.getMappedRange();
      t.expect(arraybuffer.byteLength === size);
      buffer.unmap();
      t.expect(arraybuffer.byteLength === 0, 'Mapping should be detached');
    }
  });
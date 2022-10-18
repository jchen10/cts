export const description = `
Tests for validation in beginComputePass and GPUComputePassDescriptor as its optional descriptor.
`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { kQueryTypes } from '../../../capability_info.js';
import { ValidationTest } from '../validation_test.js';

class F extends ValidationTest {
  tryComputePass(success: boolean, descriptor: GPUComputePassDescriptor): void {
    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass(descriptor);
    computePass.end();

    this.expectValidationError(() => {
      encoder.finish();
    }, !success);
  }
}

export const g = makeTestGroup(F);

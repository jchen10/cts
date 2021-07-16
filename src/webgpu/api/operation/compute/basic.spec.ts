export const description = `
Basic command buffer compute tests.
`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { DefaultLimits } from '../../../constants.js';
import { GPUTest } from '../../../gpu_test.js';
import { checkElementsEqualGenerated } from '../../../util/check_contents.js';

export const g = makeTestGroup(GPUTest);

g.test('memcpy').fn(async t => {
  const data = new Uint32Array([0x01020304]);

  const src = t.device.createBuffer({
    mappedAtCreation: true,
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  new Uint32Array(src.getMappedRange()).set(data);
  src.unmap();

  const dst = t.device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
  });

  const pipeline = t.device.createComputePipeline({
    compute: {
      module: t.device.createShaderModule({
        code: `
          [[block]] struct Data {
              value : u32;
          };

          [[group(0), binding(0)]] var<storage, read> src : Data;
          [[group(0), binding(1)]] var<storage, read_write> dst : Data;

          [[stage(compute), workgroup_size(1)]] fn main() {
            dst.value = src.value;
            return;
          }
        `,
      }),
      entryPoint: 'main',
    },
  });

  const bg = t.device.createBindGroup({
    entries: [
      { binding: 0, resource: { buffer: src, offset: 0, size: 4 } },
      { binding: 1, resource: { buffer: dst, offset: 0, size: 4 } },
    ],
    layout: pipeline.getBindGroupLayout(0),
  });

  const encoder = t.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bg);
  pass.dispatch(1);
  pass.endPass();
  t.device.queue.submit([encoder.finish()]);

  t.expectGPUBufferValuesEqual(dst, data);
});

g.test('large_dispatch')
  .desc(`Test reasonably-sized large dispatches (see also: stress tests).`)
  .params(u =>
    u
      // Reasonably-sized powers of two, and some stranger larger sizes.
      .combine('dispatchSize', [
        256,
        2048,
        315,
        628,
        2179,
        DefaultLimits.maxComputePerDimensionDispatchSize,
      ])
      // Test some reasonable workgroup sizes.
      .beginSubcases()
      // 0 == x axis; 1 == y axis; 2 == z axis.
      .combine('largeDimension', [0, 1, 2] as const)
      .expand('workgroupSize', p => [
        1,
        2,
        8,
        32,
        DefaultLimits.maxComputeWorkgroupSize[p.largeDimension],
      ])
  )
  .fn(async t => {
    // The output storage buffer is filled with this value.
    const val = 0x01020304;
    const badVal = 0xbaadf00d;

    const wgSize = t.params.workgroupSize;
    const bufferLength = t.params.dispatchSize * wgSize;
    const bufferByteSize = Uint32Array.BYTES_PER_ELEMENT * bufferLength;
    const dst = t.device.createBuffer({
      size: bufferByteSize,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
    });

    // Only use one large dimension and workgroup size in the dispatch
    // call to keep the size of the test reasonable.
    const dims = [1, 1, 1];
    dims[t.params.largeDimension] = t.params.dispatchSize;
    const wgSizes = [1, 1, 1];
    wgSizes[t.params.largeDimension] = t.params.workgroupSize;
    const pipeline = t.device.createComputePipeline({
      compute: {
        module: t.device.createShaderModule({
          code: `
            [[block]] struct OutputBuffer {
              value : array<u32>;
            };

            [[group(0), binding(0)]] var<storage, read_write> dst : OutputBuffer;

            [[stage(compute), workgroup_size(${wgSizes[0]}, ${wgSizes[1]}, ${wgSizes[2]})]]
            fn main(
              [[builtin(global_invocation_id)]] GlobalInvocationID : vec3<u32>
            ) {
              var xExtent : u32 = ${dims[0]}u * ${wgSizes[0]}u;
              var yExtent : u32 = ${dims[1]}u * ${wgSizes[1]}u;
              var zExtent : u32 = ${dims[2]}u * ${wgSizes[2]}u;
              var index : u32 = (
                GlobalInvocationID.z * xExtent * yExtent +
                GlobalInvocationID.y * xExtent +
                GlobalInvocationID.x);
              var val : u32 = ${val}u;
              // Trivial error checking in the indexing and invocation.
              if (GlobalInvocationID.x > xExtent ||
                  GlobalInvocationID.y > yExtent ||
                  GlobalInvocationID.z > zExtent) {
                val = ${badVal}u;
              }
              dst.value[index] = val;
            }
          `,
        }),
        entryPoint: 'main',
      },
    });

    const bg = t.device.createBindGroup({
      entries: [{ binding: 0, resource: { buffer: dst, offset: 0, size: bufferByteSize } }],
      layout: pipeline.getBindGroupLayout(0),
    });

    const encoder = t.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatch(dims[0], dims[1], dims[2]);
    pass.endPass();
    t.device.queue.submit([encoder.finish()]);

    t.expectGPUBufferValuesPassCheck(dst, a => checkElementsEqualGenerated(a, i => val), {
      type: Uint32Array,
      typedLength: bufferLength,
    });

    dst.destroy();
  });

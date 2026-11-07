'use strict';

const assert = require('node:assert/strict');
const {
  minimumCommitment
} = require('../scripts/m3/r5_data_envelope.cjs');

const U128_MAX = (1n << 128n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const SECOND_NS = 1000000000n;

function uint(value, field, maximum = U128_MAX) {
  assert.equal(
    typeof value,
    'string',
    `${field} must be a decimal string`
  );

  assert.match(
    value,
    /^(0|[1-9][0-9]*)$/,
    `${field} is noncanonical`
  );

  const number = BigInt(value);

  assert(
    number > 0n && number <= maximum,
    `${field} outside allowed range`
  );

  return number;
}

class RecoveryIntent {
  constructor({
    caseId,
    worker,
    workerRewardYocto,
    rescueCapYocto,
    threshold,
    finalDeadlineNs
  }) {
    assert(
      Array.isArray(caseId) ||
      Buffer.isBuffer(caseId),
      'caseId must be 32 bytes'
    );

    assert.equal(
      caseId.length,
      32,
      'caseId must be 32 bytes'
    );

    for (const byte of caseId) {
      assert(
        Number.isInteger(byte) &&
        byte >= 0 &&
        byte <= 255,
        'invalid caseId byte'
      );
    }

    assert.match(
      worker,
      /^[a-z0-9][a-z0-9._-]{1,63}$/,
      'invalid worker account'
    );

    this.caseId = Object.freeze(
      Array.from(caseId)
    );

    this.worker = worker;

    this.workerReward = uint(
      workerRewardYocto,
      'workerRewardYocto'
    );

    this.rescueCap = uint(
      rescueCapYocto,
      'rescueCapYocto'
    );

    this.threshold = uint(
      threshold,
      'threshold'
    );

    this.finalDeadline = uint(
      finalDeadlineNs,
      'finalDeadlineNs',
      U64_MAX
    );

    assert(
      this.finalDeadline % SECOND_NS === 0n,
      'deadline must be in whole seconds'
    );

    assert(
      this.workerReward + this.rescueCap <= U128_MAX,
      'principal overflow'
    );

    Object.freeze(this);
  }

  toFundingInput() {
    return {
      case_id: [...this.caseId],
      worker: this.worker,
      worker_reward: this.workerReward.toString(),
      rescue_cap: this.rescueCap.toString(),
      result_profile: 'MinimumThreshold',
      result_commitment: Array.from(
        minimumCommitment(
          this.caseId,
          this.threshold
        )
      ),
      threshold: this.threshold.toString(),

      // Contract expects a JSON numeric u64.
      // Second-aligned timestamps limit rounding.
      final_deadline: Number(this.finalDeadline)
    };
  }

  async fund({buyer, contract}) {
    assert(
      buyer &&
      typeof buyer.call === 'function',
      'buyer signer required'
    );

    assert(
      contract &&
      typeof contract.view === 'function',
      'contract view adapter required'
    );

    const quote = await contract.view(
      'm3_storage_quote'
    );

    const storage = uint(
      quote.job_storage_cost,
      'job_storage_cost'
    );

    const attached =
      this.workerReward +
      this.rescueCap +
      storage;

    assert(
      attached <= U128_MAX,
      'deposit overflow'
    );

    return buyer.call(
      contract,
      'create_funded_rescue_job',
      {input: this.toFundingInput()},
      {
        attachedDeposit: attached.toString(),
        gas: '200000000000000'
      }
    );
  }
}

module.exports = {RecoveryIntent};

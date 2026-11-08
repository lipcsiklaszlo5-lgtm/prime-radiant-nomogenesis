# Nomogenesis Shield — Python SDK

The **Nomogenesis Shield** SDK is a lightweight, zero-external-dependency Python library for interacting with, evaluating, and cryptographically auditing Nomogenesis rescue markets on NEAR Protocol.

It is designed for completely external consumers, auditors, and autonomous buyer agents who need to independently verify on-chain integrity without access to internal operator private keys or infrastructure.

---

## Key Features

1. **Robust NEAR JSON-RPC Transport**:
   - Chain and network identity validation (`chain_id`) against configured environment.
   - Automatic endpoint fallback and retry logic (FastNear, near.org).
   - Strict query finality (`finality="final"`).
   - Deployed bytecode verification against authoritative contract code hashes.
   - Explicit configuration required for Mainnet deployments (no silent substitution of Testnet contracts).

2. **Independent Cryptographic Merkle Verification**:
   - Re-implements exact Nomogenesis on-chain SHA-256 Merkle tree specifications:
     $$\text{leaf}_0 = \text{SHA256}(0x00 \mid\mid \text{u64\_be}(0) \mid\mid \text{u32\_be}(\text{payload\_length}) \mid\mid \text{payload})$$
     $$\text{leaf}_1 = \text{SHA256}(0x00 \mid\mid \text{u64\_be}(1) \mid\mid \text{u32\_be}(3) \mid\mid [0x01, 0x7f, \text{kind} + 1])$$
     $$\text{root} = \text{SHA256}(0x01 \mid\mid \text{leaf}_0 \mid\mid \text{leaf}_1)$$
   - Validates component binary layouts, ascending item ordering, and metadata siblings.
   - Verifies on-chain payload commitments directly from state without trusting nodes.

3. **Deterministic Arithmetic Reconstruction**:
   - Dynamically reconstructs $\sum (\text{quantity} \times \text{unit\_price})$ from authenticated component payloads.
   - Guards against integer overflows ($u128$).
   - Authenticates the historical market result (**632**) or any generic completed rescue case.

4. **Exact Economic Buyer Policy Evaluation**:
   - Strict integer yoctoNEAR accounting without floating-point truncation or drift.
   - Accepts finite `Decimal`, `int`, and canonical decimal strings for UNIT conversion ($1\text{ UNIT} = 10^{21}\text{ yoctoNEAR}$).
   - Rejects ambiguous floats, booleans, NaN, Infinity, negative values, and sub-yocto fractional amounts.
   - Enforces buyer rationality against budget caps and outside reservation values.
   - Emits canonical unsigned decision payloads for autonomous agent consortia.

5. **Canonical Unsigned Call Builders**:
   - Generates ABI-compliant call specifications for `create_funded_rescue_job` and `register_r7_v2_consent`.
   - Incorporates real-time, authoritative on-chain storage deposit quotes.
   - Formats unsigned payloads ready for external signing with `near-cli`, Ledger, or `near-api-js`.

---

## Installation

The SDK requires **Python 3.10+** and uses only the Python standard library.

Install locally via `pip`:

```bash
pip install ./sdk/python
```

Or for development (editable mode):

```bash
pip install -e ./sdk/python --no-build-isolation
```

---

## Quick Start: Auditing Rescue Cases

### 1. Generic Rescue Case Audit

Audit any completed rescue case dynamically without hardcoded expectations:

```python
from nomogenesis import Shield

# Connect to NEAR Testnet with default deployed contract
shield = Shield(
    network="testnet",
    contract_id="nmg-r7v2-0b9a0eff20.testnet",
)

# Run generic read-only audit: authenticates Merkle proofs, reconstructs result,
# and verifies completed worker jobs
audit = shield.audit_case(
    case_id="b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12"
)

print(audit)
print("Reconstructed result:", audit.reconstructed_result)
```

### 2. Historical Testnet Market Audit (with Strict Regression Assertions)

Run an independent audit against the live NEAR Testnet expecting historical regression values:

```python
from nomogenesis import Shield, UNIT

shield = Shield(
    network="testnet",
    contract_id="nmg-r7v2-0b9a0eff20.testnet",
)

audit = shield.audit_case(
    case_id="b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12",
    expected_result=632,
    expected_claimable_yocto=34 * UNIT,
    expected_pending_yocto=0,
    expected_escrow_yocto=0,
)

print(audit)
```

Example audit report output:

```text
================================================================================
  NOMOGENESIS SHIELD AUDIT REPORT — PASSED (VERIFIED ON-CHAIN)
================================================================================
Network:                   testnet [VERIFIED]
Contract ID:               nmg-r7v2-0b9a0eff20.testnet
Deployed Code Hash:        3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD [MATCH]
Case ID:                   b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12
Case Phase:                Closed [CLOSED]
Merkle Proofs Accepted:    True
  Component 0 Root:        c7984c32d4a363564f4f0a0813973f7f520f1a528aa06f9760d388ae14a612ea
  Component 1 Root:        9b217eae2e4eb4d24305d8ed448ef5acc18d604f2116bf8d5186e559eee3f9ed
Reconstructed Result:      632 [MATCH]
Worker Jobs Completed:     True {0: 'Completed', 1: 'Completed'}
--------------------------------------------------------------------------------
Global Contract Liabilities (Contract-wide metrics, not exclusive to this case):
  Claimable Total:         34.0000 UNIT (34000000000000000000000 yocto)
  Pending Withdrawals:     0.0000 UNIT (0 yocto)
  Rescue Escrow:           0.0000 UNIT (0 yocto)
  Financial Expectations:  VERIFIED
--------------------------------------------------------------------------------
Overall Audit Status:      PASSED (VERIFIED ON-CHAIN)
Note: Querying a JSON-RPC endpoint verifies state against the queried node(s),
      but does not replace running an independent validating PoS node.
================================================================================
```

---

## Detailed Usage

### 1. Cryptographic Merkle Verification

Verify raw component bytes against on-chain roots:

```python
from nomogenesis import compute_component_root, verify_component_merkle

# Binary payload for Component 0 (quantities)
payload = bytes([1, 1, 3, ...])
expected_root = "c7984c32d4a363564f4f0a0813973f7f520f1a528aa06f9760d388ae14a612ea"

# Independent verification
is_valid = verify_component_merkle(component_kind=0, payload=payload, expected_root=expected_root)
print("Merkle valid:", is_valid)
```

### 2. Deterministic Arithmetic Result Reconstruction

Reconstruct the inner product of quantity and unit price components:

```python
from nomogenesis import reconstruct_total

# Reconstruct result dynamically from authenticated component payloads
total = reconstruct_total(quantities_payload=payload_0, prices_payload=payload_1)
print("Reconstructed Total:", total)
```

### 3. Economic Buyer Policy Evaluation (Exact Arithmetic)

Evaluate whether a proposed rescue coalition payment satisfies buyer rationality without floating point error:

```python
from decimal import Decimal
from nomogenesis import BuyerPolicy, PolicyError

# Buyer with 7 UNIT budget cap, 10 UNIT value, and 0 outside option
# Note: monetary values must be Decimal, int, or string (floats are rejected)
policy = BuyerPolicy(
    actor_id="buyer-1",
    job_id=1,
    cap="7",             # Maximum budget: 7 UNIT
    value="10",          # Task completion value: 10 UNIT
    outside_option="0",  # Reservation value: 0 UNIT
    active=True,
)

# Proposed payment: 5.5 UNIT (passed as Decimal or string)
verdict = policy.decide(payment=Decimal("5.5"), in_units=True)
print(verdict)
# PolicyVerdict(APPROVED: payment=5.5 UNIT, cap=7.0 UNIT, value_increment=10.0 UNIT, surplus=4.5 UNIT)

# Sub-yocto amounts and ambiguous floats are rejected:
# policy.decide(5.5, in_units=True) -> ValidationError (float rejected)
```

### 4. Canonical Unsigned Call Builders

Prepare transactions for offline signing:

```python
from nomogenesis import Shield, UNIT

shield = Shield(network="testnet")

# Build unsigned funding call
call = shield.build_funding_call(
    case_id="b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12",
    worker="worker0.testnet",
    worker_reward_yocto=1 * UNIT,
    rescue_cap_yocto=7 * UNIT,
    threshold=600,
    final_deadline_ns=1730999000000000000,
)

print(call.to_json())
```

---

## Offline Test Suite

Run the comprehensive unit test suite (49 tests, 0 network dependencies):

```bash
python3 -m unittest sdk/python/tests/test_sdk.py -v
```

All 49 offline tests pass in under 1 second.

---

## Public Contract Reference

- **Network**: NEAR Testnet
- **Contract Account**: `nmg-r7v2-0b9a0eff20.testnet`
- **Deployed Bytecode SHA-256**: `3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD`
- **Historical Completed Market Case**: `b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12`
- **Historical Reconstructed Result**: `632`
- **Unit Scale**: `1 UNIT = 10^21 yoctoNEAR`
- **Terminal Liabilities**: `52 UNIT` (18 UNIT native withdrawals + 34 UNIT remaining claimable)

---

## Scope and Limitations

- The Nomogenesis Testnet demonstration uses synthetic CSV datasets and operator-managed demonstration accounts.
- The SDK does not manage private keys or submit transactions directly; it focuses on read-only queries, cryptographic verification, economic evaluation, and preparing canonical unsigned call specifications.
- Querying JSON-RPC endpoints verifies state against the queried node(s), but does not replace running an independent validating PoS node.
- **Licensing**: Licensing is pending owner decision. Do not treat as MIT or public domain without explicit grant.

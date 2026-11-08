"""Comprehensive offline test suite for Nomogenesis Shield Python SDK."""

from __future__ import annotations

import hashlib
import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure local workspace source tree is prioritized over any installed package
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from nomogenesis import (
    DEFAULT_EXPECTED_CODE_HASH,
    DEFAULT_HISTORICAL_CASE_ID,
    UNIT,
    AuditReport,
    BuyerPolicy,
    NearRpcClient,
    PolicyError,
    PolicyVerdict,
    RpcError,
    ContractError,
    Shield,
    ValidationError,
    VerificationError,
    component_metadata_sibling,
    compute_component_root,
    compute_worker_result_commitment,
    encode_component_payload,
    minimum_commitment,
    parse_component_records,
    reconstruct_total,
    to_bytes32,
    to_case_id_bytes,
    unit_to_yocto,
    validate_account_id,
    validate_component_payload,
    validate_u64,
    validate_u128,
    verify_component_merkle,
    yocto_to_unit_decimal,
)

# Canonical historical fixtures from public Testnet R7-TESTNET-08D
HISTORICAL_CASE_ID = (
    "b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12"
)

# Quantities: [(4, 12), (8, 3), (15, 20)]
QUANTITY_PAYLOAD = bytes(
    [
        1, 1, 3,
        0, 4, 0, 0, 0, 0, 0, 0, 0, 12,
        0, 8, 0, 0, 0, 0, 0, 0, 0, 3,
        0, 15, 0, 0, 0, 0, 0, 0, 0, 20,
    ]
)
QUANTITY_ROOT_HEX = "c7984c32d4a363564f4f0a0813973f7f520f1a528aa06f9760d388ae14a612ea"

# Unit prices: [(4, 11), (8, 120), (15, 7)]
PRICE_PAYLOAD = bytes(
    [
        1, 2, 3,
        0, 4, 0, 0, 0, 0, 0, 0, 0, 11,
        0, 8, 0, 0, 0, 0, 0, 0, 0, 120,
        0, 15, 0, 0, 0, 0, 0, 0, 0, 7,
    ]
)
PRICE_ROOT_HEX = "9b217eae2e4eb4d24305d8ed448ef5acc18d604f2116bf8d5186e559eee3f9ed"


class TestMerkleAndPayloadIntegrity(unittest.TestCase):
    """Test cryptographic Merkle tree hashing, payload verification, and tampering."""

    def test_valid_merkle_component_0(self) -> None:
        """Verify component 0 root matches on-chain commitment."""
        computed_root = compute_component_root(0, QUANTITY_PAYLOAD)
        self.assertEqual(computed_root.hex(), QUANTITY_ROOT_HEX)
        self.assertTrue(verify_component_merkle(0, QUANTITY_PAYLOAD, QUANTITY_ROOT_HEX))

    def test_valid_merkle_component_1(self) -> None:
        """Verify component 1 root matches on-chain commitment."""
        computed_root = compute_component_root(1, PRICE_PAYLOAD)
        self.assertEqual(computed_root.hex(), PRICE_ROOT_HEX)
        self.assertTrue(verify_component_merkle(1, PRICE_PAYLOAD, PRICE_ROOT_HEX))

    def test_payload_tampering_fails(self) -> None:
        """Tampering even a single byte must cause verification failure."""
        tampered = bytearray(QUANTITY_PAYLOAD)
        tampered[-1] ^= 0x01  # Flip one bit in last quantity
        self.assertFalse(verify_component_merkle(0, bytes(tampered), QUANTITY_ROOT_HEX))

    def test_metadata_sibling_canonical(self) -> None:
        """Sibling matches domain-separated metadata hash."""
        s0 = component_metadata_sibling(0)
        s1 = component_metadata_sibling(1)
        self.assertEqual(len(s0), 32)
        self.assertEqual(len(s1), 32)
        self.assertNotEqual(s0, s1)

        expected_s0 = hashlib.sha256(
            b"\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x03\x01\x7f\x01"
        ).digest()
        self.assertEqual(s0, expected_s0)

    def test_invalid_component_kind(self) -> None:
        """Component kind must be 0 or 1."""
        with self.assertRaises(ValidationError):
            compute_component_root(2, QUANTITY_PAYLOAD)
        with self.assertRaises(ValidationError):
            component_metadata_sibling(3)

    def test_malformed_payload_short(self) -> None:
        """Payload shorter than 13 bytes must fail validation."""
        short_buf = bytes([1, 1, 1, 0, 1])
        with self.assertRaises(VerificationError):
            validate_component_payload(0, short_buf)

    def test_malformed_payload_bad_header(self) -> None:
        """Invalid version or kind in header must fail validation."""
        bad_ver = bytearray(QUANTITY_PAYLOAD)
        bad_ver[0] = 2
        with self.assertRaises(VerificationError):
            validate_component_payload(0, bytes(bad_ver))

        bad_kind = bytearray(QUANTITY_PAYLOAD)
        bad_kind[1] = 3
        with self.assertRaises(VerificationError):
            validate_component_payload(0, bytes(bad_kind))

    def test_malformed_payload_count_mismatch(self) -> None:
        """Declared record count mismatching byte length must fail."""
        bad_count = bytearray(QUANTITY_PAYLOAD)
        bad_count[2] = 4  # Header claims 4 records, but length is 33 (3 records)
        with self.assertRaises(VerificationError):
            validate_component_payload(0, bytes(bad_count))

    def test_malformed_payload_unordered_items(self) -> None:
        """Records not strictly ascending must fail."""
        unordered = bytes(
            [
                1, 1, 2,
                0, 10, 0, 0, 0, 0, 0, 0, 0, 5,
                0, 5, 0, 0, 0, 0, 0, 0, 0, 2,  # item 5 after 10
            ]
        )
        with self.assertRaises(VerificationError):
            validate_component_payload(0, unordered)

    def test_malformed_payload_duplicate_items(self) -> None:
        """Duplicate item IDs must fail."""
        duplicate = bytes(
            [
                1, 1, 2,
                0, 5, 0, 0, 0, 0, 0, 0, 0, 1,
                0, 5, 0, 0, 0, 0, 0, 0, 0, 2,  # duplicate item 5
            ]
        )
        with self.assertRaises(VerificationError):
            validate_component_payload(0, duplicate)

    def test_encode_and_parse_roundtrip(self) -> None:
        """Encoding and parsing records produces identical tuples."""
        records = [(2, 100), (5, 200), (99, 300)]
        encoded = encode_component_payload(0, records)
        parsed = parse_component_records(encoded, component_kind=0)
        self.assertEqual(parsed, records)


class TestArithmeticReconstruction(unittest.TestCase):
    """Test deterministic product-sum reconstruction and error boundaries."""

    def test_reconstruct_total_success(self) -> None:
        """Reconstruct 632 from historical Testnet components (12*11 + 3*120 + 20*7)."""
        total = reconstruct_total(QUANTITY_PAYLOAD, PRICE_PAYLOAD)
        self.assertEqual(total, 632)

    def test_reconstruct_total_mismatched_item_ids(self) -> None:
        """Mismatched item IDs between quantity and price must fail."""
        mismatched_prices = bytes(
            [
                1, 2, 3,
                0, 4, 0, 0, 0, 0, 0, 0, 0, 11,
                0, 9, 0, 0, 0, 0, 0, 0, 0, 120,  # item 9 instead of 8
                0, 15, 0, 0, 0, 0, 0, 0, 0, 7,
            ]
        )
        with self.assertRaises(VerificationError) as ctx:
            reconstruct_total(QUANTITY_PAYLOAD, mismatched_prices)
        self.assertIn("mismatch", str(ctx.exception).lower())

    def test_reconstruct_total_mismatched_length(self) -> None:
        """Different record counts must fail."""
        two_items = bytes(
            [
                1, 2, 2,
                0, 4, 0, 0, 0, 0, 0, 0, 0, 11,
                0, 8, 0, 0, 0, 0, 0, 0, 0, 120,
            ]
        )
        with self.assertRaises(VerificationError):
            reconstruct_total(QUANTITY_PAYLOAD, two_items)

    def test_worker_result_commitment_minimum_threshold(self) -> None:
        """Test MinimumThreshold domain-separated commitment matching Rust."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        comm = minimum_commitment(cid, 600)
        self.assertEqual(len(comm), 32)
        comm2 = compute_worker_result_commitment(cid, job_id=0, total=632, threshold=600)
        self.assertEqual(comm, comm2)

    def test_worker_result_commitment_exact_sum(self) -> None:
        """Test ExactSum domain-separated commitment."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        comm = compute_worker_result_commitment(cid, job_id=0, total=632, threshold=None)
        self.assertEqual(len(comm), 32)


class TestValidationUtils(unittest.TestCase):
    """Test integer, account ID, decimal, and byte conversion validators."""

    def test_u128_validation_valid(self) -> None:
        self.assertEqual(validate_u128(0), 0)
        self.assertEqual(validate_u128("100"), 100)
        self.assertEqual(validate_u128(Decimal("500")), 500)
        self.assertEqual(validate_u128(str((1 << 128) - 1)), (1 << 128) - 1)

    def test_u128_validation_invalid(self) -> None:
        with self.assertRaises(ValidationError):
            validate_u128(-1)
        with self.assertRaises(ValidationError):
            validate_u128((1 << 128))
        with self.assertRaises(ValidationError):
            validate_u128("01")  # Noncanonical leading zero
        with self.assertRaises(ValidationError):
            validate_u128("abc")
        with self.assertRaises(ValidationError):
            validate_u128(True)  # Booleans rejected
        with self.assertRaises(ValidationError):
            validate_u128(False)
        with self.assertRaises(ValidationError):
            validate_u128(5.5)  # Floats rejected
        with self.assertRaises(ValidationError):
            validate_u128(Decimal("5.5"))  # Fractional yocto rejected
        with self.assertRaises(ValidationError):
            validate_u128(Decimal("NaN"))
        with self.assertRaises(ValidationError):
            validate_u128(Decimal("Infinity"))

    def test_u64_validation(self) -> None:
        self.assertEqual(validate_u64(10), 10)
        self.assertEqual(validate_u64(Decimal("10")), 10)
        with self.assertRaises(ValidationError):
            validate_u64((1 << 64))
        with self.assertRaises(ValidationError):
            validate_u64(True)
        with self.assertRaises(ValidationError):
            validate_u64(1.5)

    def test_unit_to_yocto_exact_and_rejections(self) -> None:
        """Exact integer conversion and fractional yocto rejection."""
        # 5.5 UNIT = 5500000000000000000000 yocto
        self.assertEqual(unit_to_yocto("5.5"), 55 * UNIT // 10)
        self.assertEqual(unit_to_yocto(Decimal("5.5")), 55 * UNIT // 10)
        self.assertEqual(unit_to_yocto(7), 7 * UNIT)

        # Sub-yocto fractional amount rejected: 10^-22 UNIT = 0.1 yocto
        with self.assertRaises(ValidationError) as ctx:
            unit_to_yocto(Decimal("0.0000000000000000000001"))
        self.assertIn("fractional yoctoNEAR", str(ctx.exception))

        # Float rejected
        with self.assertRaises(ValidationError):
            unit_to_yocto(5.5)

        # Booleans rejected
        with self.assertRaises(ValidationError):
            unit_to_yocto(True)

        # NaN / Inf rejected
        with self.assertRaises(ValidationError):
            unit_to_yocto(Decimal("NaN"))
        with self.assertRaises(ValidationError):
            unit_to_yocto(Decimal("Infinity"))

    def test_yocto_to_unit_decimal(self) -> None:
        self.assertEqual(yocto_to_unit_decimal(55 * UNIT // 10), Decimal("5.5"))

    def test_account_id_validation(self) -> None:
        self.assertEqual(validate_account_id("alice.near"), "alice.near")
        self.assertEqual(validate_account_id("nmg-r7v2-0b9a0eff20.testnet"), "nmg-r7v2-0b9a0eff20.testnet")
        with self.assertRaises(ValidationError):
            validate_account_id("A")  # Uppercase not allowed
        with self.assertRaises(ValidationError):
            validate_account_id("x")  # Too short

    def test_to_bytes32(self) -> None:
        b = to_bytes32(HISTORICAL_CASE_ID)
        self.assertEqual(len(b), 32)
        self.assertEqual(b.hex(), HISTORICAL_CASE_ID)
        with self.assertRaises(ValidationError):
            to_bytes32("deadbeef")  # Too short


class TestBuyerEconomicPolicy(unittest.TestCase):
    """Test buyer individual rationality, surplus, outside option constraints, and exact arithmetic."""

    def test_buyer_policy_approved(self) -> None:
        """Buyer 1 approves payment <= capacity and payment <= incremental value."""
        policy = BuyerPolicy(
            actor_id="buyer-1",
            job_id=1,
            cap=7,
            value=10,
            outside_option=0,
            active=True,
        )
        verdict = policy.decide(payment="5.5", in_units=True)
        self.assertTrue(verdict.approved)
        self.assertEqual(verdict.capacity_units_exact, Decimal(7))
        self.assertEqual(verdict.incremental_value_units_exact, Decimal(10))
        self.assertEqual(verdict.surplus_units_exact, Decimal("4.5"))
        self.assertEqual(verdict.capacity_units, 7.0)

    def test_buyer_policy_reject_exceeds_cap(self) -> None:
        """Payment exceeding budget cap is rejected."""
        policy = BuyerPolicy(
            actor_id="buyer-1",
            job_id=1,
            cap=5,
            value=10,
            outside_option=0,
        )
        verdict = policy.decide(payment=6, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("exceeds buyer authorized budget cap", verdict.reason)

        with self.assertRaises(PolicyError):
            policy.validate(payment=6, in_units=True)

    def test_buyer_policy_reject_exceeds_incremental_value(self) -> None:
        """Buyer 3: outside option = 10, value = 10 => incremental value = 0; must reject."""
        policy = BuyerPolicy(
            actor_id="buyer-3",
            job_id=3,
            cap=7,
            value=10,
            outside_option=10,
            active=True,
        )
        verdict = policy.decide(payment="5.5", in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("exceeds incremental economic value", verdict.reason)

    def test_buyer_policy_reject_inactive(self) -> None:
        """Inactive buyer policy rejects all payments."""
        policy = BuyerPolicy(
            actor_id="buyer-off",
            job_id=1,
            cap=10,
            value=20,
            active=False,
        )
        verdict = policy.decide(payment=1, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("inactive", verdict.reason)

    def test_buyer_policy_reject_zero_or_negative(self) -> None:
        """Zero or negative payment is rejected."""
        policy = BuyerPolicy(actor_id="buyer-1", job_id=1, cap=7, value=10)
        verdict = policy.decide(payment=0, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("strictly positive", verdict.reason)

    def test_buyer_policy_rejects_floats_and_booleans(self) -> None:
        """Floats and booleans rejected in constructor and decide()."""
        with self.assertRaises(ValidationError):
            BuyerPolicy(actor_id="b", job_id=1, cap=7.5, value=10)
        with self.assertRaises(ValidationError):
            BuyerPolicy(actor_id="b", job_id=True, cap=7, value=10)

        policy = BuyerPolicy(actor_id="b", job_id=1, cap=7, value=10)
        with self.assertRaises(ValidationError):
            policy.decide(5.5, in_units=True)
        with self.assertRaises(ValidationError):
            policy.decide(True)

    def test_buyer_policy_serialization(self) -> None:
        """Serialization and loading from dictionary matches standard fields."""
        data = {
            "actor_id": "buyer-2",
            "role": "buyer",
            "job_id": 2,
            "cap": 7,
            "value": 10,
            "outside_option": 0,
            "active": True,
        }
        policy = BuyerPolicy.from_dict(data)
        self.assertEqual(policy.actor_id, "buyer-2")
        self.assertEqual(policy.cap, Decimal(7))
        payload = policy.canonical_decision_payload(job_id=2, payment=5 * UNIT)
        self.assertTrue(payload["approved"])
        self.assertEqual(payload["exact_payment"], str(5 * UNIT))


class TestUnsignedCallBuilders(unittest.TestCase):
    """Test construction of canonical unsigned NEAR calls with storage quotes."""

    def setUp(self) -> None:
        self.shield = Shield(network="testnet", contract_id="nmg-r7v2-0b9a0eff20.testnet")

    def test_build_funding_call(self) -> None:
        """Test builder for create_funded_rescue_job."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        call = self.shield.build_funding_call(
            case_id=cid,
            worker="worker0.testnet",
            worker_reward_yocto=1 * UNIT,
            rescue_cap_yocto=7 * UNIT,
            threshold=600,
            final_deadline_ns=1730999000000000000,
            job_storage_cost_yocto=5760000000000000000000,
        )
        self.assertEqual(call.method_name, "create_funded_rescue_job")
        self.assertEqual(call.contract_id, "nmg-r7v2-0b9a0eff20.testnet")
        self.assertIn("input", call.args)
        inp = call.args["input"]
        self.assertEqual(inp["worker"], "worker0.testnet")
        self.assertEqual(inp["result_profile"], "MinimumThreshold")
        self.assertEqual(inp["worker_reward"], str(1 * UNIT))
        self.assertEqual(inp["rescue_cap"], str(7 * UNIT))

        expected_deposit = 1 * UNIT + 7 * UNIT + 5760000000000000000000
        self.assertEqual(call.attached_deposit, str(expected_deposit))

    def test_build_funding_call_unaligned_deadline(self) -> None:
        """Deadline not aligned to whole seconds must fail."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        with self.assertRaises(ValidationError):
            self.shield.build_funding_call(
                case_id=cid,
                worker="worker0.testnet",
                worker_reward_yocto=1 * UNIT,
                rescue_cap_yocto=7 * UNIT,
                threshold=600,
                final_deadline_ns=1730999000000000001,
                job_storage_cost_yocto=5760000000000000000000,
            )

    def test_build_consent_call(self) -> None:
        """Test builder for register_r7_v2_consent."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        plan_hash = hashlib.sha256(b"dummy_plan").digest()
        call = self.shield.build_consent_call(
            case_id=cid,
            job_id=0,
            buyer="buyer0.testnet",
            nonce=101,
            plan_hash=plan_hash,
            max_payment_yocto=7 * UNIT,
            exact_payment_yocto=55 * UNIT // 10,
            expires_at_ns=1730999900000000000,
            consent_storage_cost_yocto=40960000000000000000000,
        )
        self.assertEqual(call.method_name, "register_r7_v2_consent")
        inp = call.args["input"]
        self.assertEqual(inp["buyer"], "buyer0.testnet")
        self.assertEqual(inp["nonce"], 101)
        self.assertEqual(inp["exact_payment"], str(55 * UNIT // 10))
        self.assertEqual(call.attached_deposit, "40960000000000000000000")

    def test_build_consent_call_exact_exceeds_max(self) -> None:
        """exact_payment > max_payment must fail."""
        cid = bytes.fromhex(HISTORICAL_CASE_ID)
        plan_hash = hashlib.sha256(b"dummy_plan").digest()
        with self.assertRaises(ValidationError):
            self.shield.build_consent_call(
                case_id=cid,
                job_id=0,
                buyer="buyer0.testnet",
                nonce=101,
                plan_hash=plan_hash,
                max_payment_yocto=5 * UNIT,
                exact_payment_yocto=6 * UNIT,
                expires_at_ns=1730999900000000000,
            )


class TestShieldClientOfflineMock(unittest.TestCase):
    """Test RPC fallback, network validation, error handling, and generalized case audits."""

    def test_unsupported_network(self) -> None:
        with self.assertRaises(ValidationError):
            Shield(network="solana")

    def test_mainnet_requires_explicit_config(self) -> None:
        """Mainnet without contract or code hash must raise ValidationError."""
        with self.assertRaises(ValidationError):
            Shield(network="mainnet")
        with self.assertRaises(ValidationError):
            Shield(network="mainnet", contract_id="nomogenesis.near")
        shield = Shield(
            network="mainnet",
            contract_id="nomogenesis.near",
            expected_code_hash="3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD",
        )
        self.assertEqual(shield.network, "mainnet")

    def test_rpc_client_fallback_success(self) -> None:
        """First endpoint fails, fallback endpoint succeeds."""
        client = NearRpcClient(
            endpoints=["https://bad-endpoint.example.com", "https://good-endpoint.example.com"],
            retries_per_endpoint=1,
        )

        def mock_urlopen(req, timeout):
            if "bad-endpoint" in req.full_url:
                raise TimeoutError("Endpoint timed out")
            mock_resp = MagicMock()
            mock_resp.__enter__.return_value.getcode.return_value = 200
            mock_resp.__enter__.return_value.read.return_value = json.dumps(
                {"jsonrpc": "2.0", "id": "test", "result": {"hash": "3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD"}}
            ).encode("utf-8")
            return mock_resp

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            code_hash = client.view_code("contract.testnet")
            self.assertEqual(code_hash, "3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD")

    def test_rpc_client_all_fail(self) -> None:
        """All endpoints failing raises RpcError."""
        client = NearRpcClient(endpoints=["https://dead1.example.com", "https://dead2.example.com"])
        with patch("urllib.request.urlopen", side_effect=TimeoutError("Network down")):
            with self.assertRaises(RpcError):
                client.view_code("contract.testnet")

    def test_rpc_malformed_response_missing_result(self) -> None:
        """Missing 'result' field in JSON-RPC response raises RpcError."""
        client = NearRpcClient(endpoints=["https://rpc.testnet.near.org"])
        mock_resp = MagicMock()
        mock_resp.__enter__.return_value.getcode.return_value = 200
        mock_resp.__enter__.return_value.read.return_value = json.dumps(
            {"jsonrpc": "2.0", "id": "test"}
        ).encode("utf-8")
        with patch("urllib.request.urlopen", return_value=mock_resp):
            with self.assertRaises(RpcError) as ctx:
                client.view_code("contract.testnet")
            self.assertIn("missing 'result'", str(ctx.exception).lower())

    def test_rpc_contract_execution_error(self) -> None:
        """Contract error in view_function raises ContractError."""
        client = NearRpcClient(endpoints=["https://rpc.testnet.near.org"])
        mock_resp = MagicMock()
        mock_resp.__enter__.return_value.getcode.return_value = 200
        mock_resp.__enter__.return_value.read.return_value = json.dumps(
            {"jsonrpc": "2.0", "id": "test", "result": {"error": "Contract panicked"}}
        ).encode("utf-8")
        with patch("urllib.request.urlopen", return_value=mock_resp):
            with self.assertRaises(ContractError):
                client.view_function("contract.testnet", "get_rescue_case")

    def test_offline_mock_audit_historical_case(self) -> None:
        """Mocked complete historical audit verifying report fields and 632 result."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")

        cid_bytes = bytes.fromhex(HISTORICAL_CASE_ID)
        q_root_bytes = bytes.fromhex(QUANTITY_ROOT_HEX)
        p_root_bytes = bytes.fromhex(PRICE_ROOT_HEX)

        mock_case_dict = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "provider.testnet",
            "component_commitments": [list(q_root_bytes), list(p_root_bytes)],
            "dependency_deadline": 100,
            "bid_close": 200,
            "award_close": 300,
            "recovery_deadline": 400,
            "job_ids": [0, 1],
            "phase": "Closed",
            "awarded_bundle_id": 1,
            "resolved_payloads": [list(QUANTITY_PAYLOAD), list(PRICE_PAYLOAD)],
            "offer_ids": [2, 3],
        }

        mock_job_0 = {
            "id": 0,
            "case_id": list(cid_bytes),
            "buyer": "buyer0.testnet",
            "worker": "worker0.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "600",
            "final_deadline": 500,
            "phase": "Completed",
        }

        mock_job_1 = {
            "id": 1,
            "case_id": list(cid_bytes),
            "buyer": "buyer1.testnet",
            "worker": "worker1.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "600",
            "final_deadline": 500,
            "phase": "Completed",
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return mock_case_dict
                if method == "get_rescue_job":
                    jid = args.get("job_id")
                    return mock_job_0 if jid == 0 else mock_job_1
                if method == "payout_totals":
                    return [str(34 * UNIT), "0"]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect

            report = shield.audit_case(
                HISTORICAL_CASE_ID,
                expected_result=632,
                expected_claimable_yocto=34 * UNIT,
                expected_pending_yocto=0,
                expected_escrow_yocto=0,
            )
            self.assertTrue(report.passed)
            self.assertEqual(report.reconstructed_result, 632)
            self.assertTrue(report.merkle_proofs_verified)
            self.assertTrue(report.code_hash_verified)
            self.assertTrue(report.payout_totals_verified)
            self.assertEqual(report.claimable_total_units, 34.0)
            self.assertEqual(report.pending_total_units, 0.0)
            self.assertEqual(report.rescue_escrow_units, 0.0)
            self.assertEqual(len(report.errors), 0)

    def test_generic_successful_case_audit_non_632(self) -> None:
        """Generic case audit with result != 632 and job IDs != [0, 1] passes without demo defaults."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex("11" * 32)

        # Component 0: [(10, 5), (20, 10)]
        q_payload = encode_component_payload(0, [(10, 5), (20, 10)])
        q_root = compute_component_root(0, q_payload)

        # Component 1: [(10, 2), (20, 100)]
        # Total = 5*2 + 10*100 = 10 + 1000 = 1010
        p_payload = encode_component_payload(1, [(10, 2), (20, 100)])
        p_root = compute_component_root(1, p_payload)

        generic_case = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "generic_provider.testnet",
            "component_commitments": [list(q_root), list(p_root)],
            "dependency_deadline": 1000,
            "bid_close": 2000,
            "award_close": 3000,
            "recovery_deadline": 4000,
            "job_ids": [42, 99],  # Arbitrary job IDs
            "phase": "Closed",
            "awarded_bundle_id": 7,
            "resolved_payloads": [list(q_payload), list(p_payload)],
            "offer_ids": [5, 6],
        }

        generic_job_42 = {
            "id": 42,
            "case_id": list(cid_bytes),
            "buyer": "buyer_a.testnet",
            "worker": "worker_a.testnet",
            "worker_reward": str(2 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "500",
            "final_deadline": 5000,
            "phase": "Completed",
        }

        generic_job_99 = {
            "id": 99,
            "case_id": list(cid_bytes),
            "buyer": "buyer_b.testnet",
            "worker": "worker_b.testnet",
            "worker_reward": str(3 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "500",
            "final_deadline": 5000,
            "phase": "Completed",
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return generic_case
                if method == "get_rescue_job":
                    jid = args.get("job_id")
                    return generic_job_42 if jid == 42 else generic_job_99
                if method == "payout_totals":
                    # Global payout totals are 100 UNIT and 5 UNIT pending - not 34!
                    return [str(100 * UNIT), str(5 * UNIT)]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect

            # Auditing without historical expectations
            report = shield.audit_case(cid_bytes)
            self.assertTrue(report.passed)
            self.assertEqual(report.reconstructed_result, 1010)
            self.assertTrue(report.result_verified)
            self.assertEqual(report.job_statuses, {42: "Completed", 99: "Completed"})
            self.assertEqual(report.claimable_total_units, 100.0)
            self.assertEqual(report.pending_total_units, 5.0)
            self.assertEqual(len(report.errors), 0)

    def test_case_audit_with_expected_result_mismatch(self) -> None:
        """Generic case audit fails if caller's explicit expected_result does not match."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex("22" * 32)
        q_payload = encode_component_payload(0, [(10, 5)])
        q_root = compute_component_root(0, q_payload)
        p_payload = encode_component_payload(1, [(10, 2)])
        p_root = compute_component_root(1, p_payload)

        case = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "p.testnet",
            "component_commitments": [list(q_root), list(p_root)],
            "dependency_deadline": 1,
            "bid_close": 2,
            "award_close": 3,
            "recovery_deadline": 4,
            "job_ids": [1],
            "phase": "Closed",
            "awarded_bundle_id": 1,
            "resolved_payloads": [list(q_payload), list(p_payload)],
            "offer_ids": [1],
        }

        job = {
            "id": 1,
            "case_id": list(cid_bytes),
            "buyer": "b.testnet",
            "worker": "w.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "1",
            "final_deadline": 5,
            "phase": "Completed",
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return case
                if method == "get_rescue_job":
                    return job
                if method == "payout_totals":
                    return ["0", "0"]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect

            # Reconstructed result is 10 (5*2), but expected is 999
            report = shield.audit_case(cid_bytes, expected_result=999)
            self.assertFalse(report.passed)
            self.assertFalse(report.result_verified)
            self.assertEqual(report.reconstructed_result, 10)
            self.assertTrue(any("does not match expected 999" in err for err in report.errors))

    def test_case_audit_fails_on_network_mismatch(self) -> None:
        """Audit fails closed if node reports wrong chain_id."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "mainnet"}):
            report = shield.audit_case(HISTORICAL_CASE_ID)
            self.assertFalse(report.passed)
            self.assertFalse(report.network_verified)
            self.assertTrue(any("Network verification failed" in err for err in report.errors))

    def test_case_audit_fails_if_not_closed(self) -> None:
        """Audit fails if rescue case phase is not Closed."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex(HISTORICAL_CASE_ID)
        case_open = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "p.testnet",
            "component_commitments": [list(bytes(32)), list(bytes(32))],
            "dependency_deadline": 1,
            "bid_close": 2,
            "award_close": 3,
            "recovery_deadline": 4,
            "job_ids": [],
            "phase": "Open",
            "awarded_bundle_id": None,
            "resolved_payloads": [None, None],
            "offer_ids": [],
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function", return_value=case_open):

            report = shield.audit_case(cid_bytes)
            self.assertFalse(report.passed)
            self.assertFalse(report.case_phase_verified)
            self.assertTrue(any("Case phase is 'Open', expected 'Closed'" in err for err in report.errors))

    def test_case_audit_job_not_completed_fails(self) -> None:
        """Audit fails if a worker job is still in Accepted phase."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex(HISTORICAL_CASE_ID)
        q_root_bytes = bytes.fromhex(QUANTITY_ROOT_HEX)
        p_root_bytes = bytes.fromhex(PRICE_ROOT_HEX)

        case = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "p.testnet",
            "component_commitments": [list(q_root_bytes), list(p_root_bytes)],
            "dependency_deadline": 1,
            "bid_close": 2,
            "award_close": 3,
            "recovery_deadline": 4,
            "job_ids": [0],
            "phase": "Closed",
            "awarded_bundle_id": 1,
            "resolved_payloads": [list(QUANTITY_PAYLOAD), list(PRICE_PAYLOAD)],
            "offer_ids": [1],
        }

        job_incomplete = {
            "id": 0,
            "case_id": list(cid_bytes),
            "buyer": "b.testnet",
            "worker": "w.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": str(1 * UNIT),
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "600",
            "final_deadline": 500,
            "phase": "Accepted",  # Not Completed!
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return case
                if method == "get_rescue_job":
                    return job_incomplete
                if method == "payout_totals":
                    return ["0", "0"]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect
            report = shield.audit_case(cid_bytes)
            self.assertFalse(report.passed)
            self.assertFalse(report.jobs_completed)
            self.assertTrue(any("Job 0 phase is 'Accepted'" in err for err in report.errors))

    def test_case_audit_job_case_id_mismatch_fails(self) -> None:
        """Audit fails if a worker job points to a different rescue case."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex(HISTORICAL_CASE_ID)
        wrong_cid = bytes.fromhex("ff" * 32)
        q_root_bytes = bytes.fromhex(QUANTITY_ROOT_HEX)
        p_root_bytes = bytes.fromhex(PRICE_ROOT_HEX)

        case = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "p.testnet",
            "component_commitments": [list(q_root_bytes), list(p_root_bytes)],
            "dependency_deadline": 1,
            "bid_close": 2,
            "award_close": 3,
            "recovery_deadline": 4,
            "job_ids": [0],
            "phase": "Closed",
            "awarded_bundle_id": 1,
            "resolved_payloads": [list(QUANTITY_PAYLOAD), list(PRICE_PAYLOAD)],
            "offer_ids": [1],
        }

        job_wrong_case = {
            "id": 0,
            "case_id": list(wrong_cid),
            "buyer": "b.testnet",
            "worker": "w.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "600",
            "final_deadline": 500,
            "phase": "Completed",
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return case
                if method == "get_rescue_job":
                    return job_wrong_case
                if method == "payout_totals":
                    return ["0", "0"]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect
            report = shield.audit_case(cid_bytes)
            self.assertFalse(report.passed)
            self.assertFalse(report.jobs_completed)
            self.assertTrue(any("Job 0 references case" in err for err in report.errors))

    def test_rpc_malformed_response_not_dict(self) -> None:
        """JSON-RPC returning a non-dict raises RpcError."""
        client = NearRpcClient(endpoints=["https://rpc.testnet.near.org"])
        mock_resp = MagicMock()
        mock_resp.__enter__.return_value.getcode.return_value = 200
        mock_resp.__enter__.return_value.read.return_value = b"[\"raw_array\"]"
        with patch("urllib.request.urlopen", return_value=mock_resp):
            with self.assertRaises(RpcError) as ctx:
                client.view_code("contract.testnet")
            self.assertIn("expected json object", str(ctx.exception).lower())

    def test_case_audit_financial_expectations_mismatch(self) -> None:
        """Audit fails if caller provides explicit financial expectations that do not match on-chain totals."""
        shield = Shield(network="testnet")
        shield.rpc.finalized_block_hash = MagicMock(return_value="unit-test-final-block")
        cid_bytes = bytes.fromhex(HISTORICAL_CASE_ID)
        q_root_bytes = bytes.fromhex(QUANTITY_ROOT_HEX)
        p_root_bytes = bytes.fromhex(PRICE_ROOT_HEX)

        case = {
            "id": list(cid_bytes),
            "descriptor_version": 1,
            "descriptor_hash": list(bytes(32)),
            "original_provider": "p.testnet",
            "component_commitments": [list(q_root_bytes), list(p_root_bytes)],
            "dependency_deadline": 1,
            "bid_close": 2,
            "award_close": 3,
            "recovery_deadline": 4,
            "job_ids": [0],
            "phase": "Closed",
            "awarded_bundle_id": 1,
            "resolved_payloads": [list(QUANTITY_PAYLOAD), list(PRICE_PAYLOAD)],
            "offer_ids": [1],
        }

        job = {
            "id": 0,
            "case_id": list(cid_bytes),
            "buyer": "b.testnet",
            "worker": "w.testnet",
            "worker_reward": str(1 * UNIT),
            "held_worker_reward": "0",
            "result_profile": "MinimumThreshold",
            "result_commitment": list(bytes(32)),
            "threshold": "600",
            "final_deadline": 500,
            "phase": "Completed",
        }

        with patch.object(shield.rpc, "get_status", return_value={"chain_id": "testnet"}), \
             patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
             patch.object(shield.rpc, "view_function") as mock_view:

            def view_side_effect(contract_id, method, args=None, finality="final"):
                if method == "get_rescue_case":
                    return case
                if method == "get_rescue_job":
                    return job
                if method == "payout_totals":
                    return [str(34 * UNIT), "0"]
                if method == "rescue_escrow_total":
                    return "0"
                return None

            mock_view.side_effect = view_side_effect

            # Expected 50 UNIT claimable, but contract has 34 UNIT
            report = shield.audit_case(cid_bytes, expected_claimable_yocto=50 * UNIT)
            self.assertFalse(report.passed)
            self.assertFalse(report.financial_expectations_verified)
            self.assertTrue(any("Global claimable total mismatch" in err for err in report.errors))

            # Expected 1 UNIT escrow, but contract has 0
            report_escrow = shield.audit_case(cid_bytes, expected_escrow_yocto=1 * UNIT)
            self.assertFalse(report_escrow.passed)
            self.assertFalse(report_escrow.financial_expectations_verified)
            self.assertTrue(any("Global rescue escrow mismatch" in err for err in report_escrow.errors))



class TestR709CSnapshotAndMoney(unittest.TestCase):

    def test_large_exact_money(self):
        original = "100000000000000001.123456789012345678901"
        expected = 100000000000000001123456789012345678901
        self.assertEqual(unit_to_yocto(original), expected)
        self.assertEqual(
            unit_to_yocto(yocto_to_unit_decimal(expected)), expected
        )
        maximum = (1 << 128) - 1
        self.assertEqual(
            unit_to_yocto(yocto_to_unit_decimal(maximum)), maximum
        )

    def test_financial_rpc_rejects_float(self):
        shield = Shield(network="testnet")
        with patch.object(
            shield.rpc, "view_function",
            return_value=["1.5", "0"]
        ):
            with self.assertRaises(ContractError):
                shield.payout_totals()

    def test_financial_rpc_rejects_missing(self):
        shield = Shield(network="testnet")
        with patch.object(
            shield.rpc, "view_function", return_value=None
        ):
            with self.assertRaises(ContractError):
                shield.claimable_total()

    def test_snapshot_pins_all_queries(self):
        rpc = NearRpcClient(["https://example.test"])
        seen = []

        def fake_rpc(method, params):
            seen.append((method, dict(params)))
            if params.get("request_type") == "view_code":
                return {"hash": "expected"}
            return {"result": [ord("0")]}

        with patch.object(
            rpc, "finalized_block_hash",
            return_value="unit-test-final-block"
        ), patch.object(rpc, "rpc_call", side_effect=fake_rpc):
            with rpc.finalized_snapshot():
                self.assertEqual(
                    rpc.view_function("contract.testnet", "demo"), 0
                )
                self.assertEqual(
                    rpc.view_code("contract.testnet"), "expected"
                )

        for method, params in seen:
            self.assertEqual(method, "query")
            self.assertEqual(
                params["block_id"], "unit-test-final-block"
            )
            self.assertNotIn("finality", params)

        self.assertIsNone(rpc._pinned_block_id)

    def test_snapshot_clears_after_error(self):
        rpc = NearRpcClient(["https://example.test"])
        with patch.object(
            rpc, "finalized_block_hash", return_value="test-block"
        ):
            with self.assertRaises(RuntimeError):
                with rpc.finalized_snapshot():
                    raise RuntimeError("test rollback")
        self.assertIsNone(rpc._pinned_block_id)

    def test_funding_total_overflow(self):
        shield = Shield(network="testnet")
        with self.assertRaises(ValidationError):
            shield.build_funding_call(
                case_id=bytes(32),
                worker="worker.testnet",
                worker_reward_yocto=(1 << 128) - 1,
                rescue_cap_yocto=1,
                threshold=1,
                final_deadline_ns=1800000000000000000,
                job_storage_cost_yocto=1,
            )

if __name__ == "__main__":
    unittest.main()

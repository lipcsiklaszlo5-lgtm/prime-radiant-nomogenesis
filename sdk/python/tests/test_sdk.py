"""Comprehensive offline test suite for Nomogenesis Shield Python SDK."""

from __future__ import annotations

import hashlib
import json
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

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
    validate_account_id,
    validate_component_payload,
    validate_u64,
    validate_u128,
    verify_component_merkle,
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

        # Expected sibling 0 = SHA256(0x00 || u64_be(1) || u32_be(3) || [0x01, 0x7f, 0x01])
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
    """Test integer, account ID, and byte conversion validators."""

    def test_u128_validation_valid(self) -> None:
        self.assertEqual(validate_u128(0), 0)
        self.assertEqual(validate_u128("100"), 100)
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

    def test_u64_validation(self) -> None:
        self.assertEqual(validate_u64(10), 10)
        with self.assertRaises(ValidationError):
            validate_u64((1 << 64))

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
    """Test buyer individual rationality, surplus, and outside option constraints."""

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
        verdict = policy.decide(payment=5.5, in_units=True)
        self.assertTrue(verdict.approved)
        self.assertEqual(verdict.capacity_units, 7.0)
        self.assertEqual(verdict.incremental_value_units, 10.0)
        self.assertAlmostEqual(verdict.surplus_units, 4.5)

    def test_buyer_policy_reject_exceeds_cap(self) -> None:
        """Payment exceeding budget cap is rejected."""
        policy = BuyerPolicy(
            actor_id="buyer-1",
            job_id=1,
            cap=5,
            value=10,
            outside_option=0,
        )
        verdict = policy.decide(payment=6.0, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("exceeds buyer authorized budget cap", verdict.reason)

        with self.assertRaises(PolicyError):
            policy.validate(payment=6.0, in_units=True)

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
        verdict = policy.decide(payment=5.5, in_units=True)
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
        verdict = policy.decide(payment=1.0, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("inactive", verdict.reason)

    def test_buyer_policy_reject_zero_or_negative(self) -> None:
        """Zero or negative payment is rejected."""
        policy = BuyerPolicy(actor_id="buyer-1", job_id=1, cap=7, value=10)
        verdict = policy.decide(payment=0, in_units=True)
        self.assertFalse(verdict.approved)
        self.assertIn("strictly positive", verdict.reason)

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
        payload = policy.canonical_decision_payload(job_id=2, payment_yocto=5 * UNIT)
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
            exact_payment_yocto=int(5.5 * UNIT),
            expires_at_ns=1730999900000000000,
            consent_storage_cost_yocto=40960000000000000000000,
        )
        self.assertEqual(call.method_name, "register_r7_v2_consent")
        inp = call.args["input"]
        self.assertEqual(inp["buyer"], "buyer0.testnet")
        self.assertEqual(inp["nonce"], 101)
        self.assertEqual(inp["exact_payment"], str(int(5.5 * UNIT)))
        self.assertEqual(call.attached_deposit, "40960000000000000000000")


class TestShieldClientOfflineMock(unittest.TestCase):
    """Test RPC fallback, network validation, and end-to-end mock audit."""

    def test_unsupported_network(self) -> None:
        with self.assertRaises(ValidationError):
            Shield(network="solana")

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

    def test_offline_mock_audit_case(self) -> None:
        """Mocked complete audit verifying report fields and 632 result."""
        shield = Shield(network="testnet")

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

        with patch.object(shield.rpc, "view_code", return_value=DEFAULT_EXPECTED_CODE_HASH), \
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

            report = shield.audit_case(HISTORICAL_CASE_ID)
            self.assertTrue(report.passed)
            self.assertEqual(report.reconstructed_result, 632)
            self.assertTrue(report.merkle_proofs_verified)
            self.assertTrue(report.code_hash_verified)
            self.assertTrue(report.payout_totals_verified)
            self.assertEqual(report.claimable_total_units, 34.0)
            self.assertEqual(report.pending_total_units, 0.0)
            self.assertEqual(report.rescue_escrow_units, 0.0)
            self.assertEqual(len(report.errors), 0)


if __name__ == "__main__":
    unittest.main()

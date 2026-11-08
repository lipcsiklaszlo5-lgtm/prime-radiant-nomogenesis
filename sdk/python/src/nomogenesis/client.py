"""NEAR JSON-RPC adapter, typed contract interfaces, call builders, and Shield auditor."""

from __future__ import annotations

import base64
from contextlib import contextmanager
import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field, replace
from decimal import Decimal
from typing import Any, Sequence

from .exceptions import ContractError, NomogenesisError, RpcError, ValidationError, VerificationError
from .proof import (
    CONSENT_DOMAIN,
    PLAN_DOMAIN,
    SECOND_NS,
    UNIT,
    compute_component_root,
    minimum_commitment,
    reconstruct_total,
    to_bytes32,
    to_case_id_bytes,
    validate_account_id,
    validate_component_payload,
    validate_u128,
    validate_u64,
    verify_component_merkle,
)

DEFAULT_TESTNET_RPCS: list[str] = [
    "https://rpc.testnet.fastnear.com",
    "https://rpc.testnet.near.org",
]

DEFAULT_MAINNET_RPCS: list[str] = [
    "https://rpc.mainnet.fastnear.com",
    "https://rpc.mainnet.near.org",
]

DEFAULT_TESTNET_CONTRACT: str = "nmg-r7v2-0b9a0eff20.testnet"
DEFAULT_EXPECTED_CODE_HASH: str = "3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD"
DEFAULT_HISTORICAL_CASE_ID: str = (
    "b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12"
)

def _chain_money(value: Any, name: str) -> int:
    try:
        return validate_u128(value, name)
    except ValidationError as exc:
        raise ContractError(f"Invalid on-chain amount {name}: {exc}") from exc


GAS_FUNDING_YOCTO: str = "200000000000000"  # 200 Tgas
GAS_CONSENT_YOCTO: str = "50000000000000"   # 50 Tgas


class NearRpcClient:
    """Robust NEAR Protocol JSON-RPC client with endpoint fallback, bounded timeouts, and retries."""

    def __init__(
        self,
        endpoints: Sequence[str] | str,
        timeout_seconds: float = 15.0,
        retries_per_endpoint: int = 2,
    ) -> None:
        if isinstance(endpoints, str):
            self.endpoints = [endpoints]
        else:
            self.endpoints = list(endpoints)

        if not self.endpoints:
            raise ValidationError("At least one RPC endpoint must be provided")

        self.timeout_seconds = float(timeout_seconds)
        self.retries_per_endpoint = max(1, int(retries_per_endpoint))
        self._pinned_block_id: str | None = None

    def rpc_call(self, method: str, params: Any) -> Any:
        """Execute a JSON-RPC 2.0 query across configured endpoints with fallback. Fails closed on malformed data."""
        payload = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": "nomogenesis-shield",
                "method": method,
                "params": params,
            }
        ).encode("utf-8")

        errors: list[str] = []

        for endpoint in self.endpoints:
            for attempt in range(self.retries_per_endpoint):
                req = urllib.request.Request(
                    endpoint,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "nomogenesis-shield-python/0.1.0",
                    },
                )
                try:
                    with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                        status_code = resp.getcode()
                        if status_code != 200:
                            raise RpcError(f"HTTP status {status_code} from {endpoint}")
                        raw_data = resp.read()
                        data = json.loads(raw_data.decode("utf-8"))

                    if not isinstance(data, dict):
                        raise RpcError(
                            f"Malformed JSON-RPC response from {endpoint}: expected JSON object, got {type(data).__name__}"
                        )

                    if "error" in data:
                        err_obj = data["error"]
                        raise RpcError(f"RPC error from {endpoint}: {err_obj}")

                    if "result" not in data:
                        raise RpcError(f"Malformed JSON-RPC response from {endpoint}: missing 'result' field in response")

                    return data.get("result")

                except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, RpcError) as exc:
                    errors.append(f"{endpoint} (attempt {attempt + 1}): {exc}")

        raise RpcError(f"All RPC endpoints failed: {'; '.join(errors)}")


    def finalized_block_hash(self) -> str:
        result = self.rpc_call("block", {"finality": "final"})
        header = result.get("header") if isinstance(result, dict) else None
        block_hash = header.get("hash") if isinstance(header, dict) else None
        alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        if (
            not isinstance(block_hash, str)
            or not 32 <= len(block_hash) <= 64
            or any(c not in alphabet for c in block_hash)
        ):
            raise RpcError("Malformed finalized block hash")
        return block_hash

    @contextmanager
    def finalized_snapshot(self):
        if self._pinned_block_id is not None:
            raise RpcError("Nested snapshot is unsupported")
        block_hash = self.finalized_block_hash()
        self._pinned_block_id = block_hash
        try:
            yield block_hash
        finally:
            self._pinned_block_id = None

    def _block_reference(self, finality: str) -> dict[str, Any]:
        if self._pinned_block_id is not None:
            return {"block_id": self._pinned_block_id}
        return {"finality": finality}

    def get_status(self) -> dict[str, Any]:
        """Query node status and return status information containing chain_id."""
        result = self.rpc_call("status", {})
        if not isinstance(result, dict) or "chain_id" not in result:
            raise RpcError(f"Malformed status response from RPC: {result}")
        return result

    def view_function(
        self,
        contract_id: str,
        method_name: str,
        args: dict[str, Any] | None = None,
        finality: str = "final",
    ) -> Any:
        """Call a view function on a contract and deserialize the JSON return value."""
        validate_account_id(contract_id, "contract_id")
        args_payload = json.dumps(args or {}).encode("utf-8")
        args_base64 = base64.b64encode(args_payload).decode("ascii")

        params = {
            "request_type": "call_function",
            "account_id": contract_id,
            "method_name": method_name,
            "args_base64": args_base64,
        }
        params.update(self._block_reference(finality))

        result = self.rpc_call("query", params)

        if not isinstance(result, dict):
            raise RpcError(f"Unexpected response type for call_function: {type(result)}")

        if "error" in result:
            raise ContractError(f"Contract execution error in '{method_name}': {result['error']}")

        raw_result = result.get("result")
        if raw_result is None:
            return None

        if isinstance(raw_result, list):
            byte_buf = bytes(raw_result)
        elif isinstance(raw_result, (bytes, bytearray)):
            byte_buf = bytes(raw_result)
        elif isinstance(raw_result, str):
            try:
                byte_buf = base64.b64decode(raw_result)
            except Exception:
                byte_buf = raw_result.encode("utf-8")
        else:
            raise RpcError(f"Cannot parse raw view result of type {type(raw_result)}")

        if not byte_buf:
            return None

        try:
            text = byte_buf.decode("utf-8")
            return json.loads(text)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ContractError(f"Failed to decode return value from '{method_name}': {exc}") from exc

    def view_code(self, contract_id: str, finality: str = "final") -> str:
        """Query contract code hash."""
        validate_account_id(contract_id, "contract_id")
        params = {
            "request_type": "view_code",
            "account_id": contract_id,
        }
        params.update(self._block_reference(finality))
        result = self.rpc_call("query", params)
        if not isinstance(result, dict) or "hash" not in result:
            raise RpcError(f"view_code failed for '{contract_id}': {result}")
        code_hash = str(result["hash"]).strip()
        if not code_hash:
            raise RpcError(f"view_code returned empty hash for '{contract_id}'")
        return code_hash


@dataclass(frozen=True)
class RescueCaseView:
    """On-chain view of a Nomogenesis rescue case."""

    id: bytes
    descriptor_version: int
    descriptor_hash: bytes
    original_provider: str
    component_commitments: list[bytes]
    dependency_deadline: int
    bid_close: int
    award_close: int
    recovery_deadline: int
    job_ids: list[int]
    phase: str
    awarded_bundle_id: int | None
    resolved_payloads: list[bytes | None]
    offer_ids: list[int]
    raw: dict[str, Any]

    @property
    def id_hex(self) -> str:
        return self.id.hex()

    @property
    def descriptor_hash_hex(self) -> str:
        return self.descriptor_hash.hex()

    @property
    def component_commitments_hex(self) -> list[str]:
        return [c.hex() for c in self.component_commitments]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> RescueCaseView:
        payloads = [
            bytes(p) if p is not None else None
            for p in d.get("resolved_payloads", [])
        ]
        return cls(
            id=bytes(d["id"]),
            descriptor_version=int(d["descriptor_version"]),
            descriptor_hash=bytes(d["descriptor_hash"]),
            original_provider=str(d["original_provider"]),
            component_commitments=[bytes(c) for c in d.get("component_commitments", [])],
            dependency_deadline=int(d["dependency_deadline"]),
            bid_close=int(d["bid_close"]),
            award_close=int(d["award_close"]),
            recovery_deadline=int(d["recovery_deadline"]),
            job_ids=[int(j) for j in d.get("job_ids", [])],
            phase=str(d["phase"]),
            awarded_bundle_id=int(d["awarded_bundle_id"]) if d.get("awarded_bundle_id") is not None else None,
            resolved_payloads=payloads,
            offer_ids=[int(o) for o in d.get("offer_ids", [])],
            raw=d,
        )


@dataclass(frozen=True)
class RescueJobView:
    """On-chain view of a Nomogenesis rescue job."""

    id: int
    case_id: bytes
    buyer: str
    worker: str
    worker_reward: int
    held_worker_reward: int
    result_profile: str
    result_commitment: bytes
    threshold: int | None
    final_deadline: int
    phase: str
    raw: dict[str, Any]

    @property
    def worker_reward_units(self) -> float:
        return self.worker_reward / UNIT

    @property
    def held_worker_reward_units(self) -> float:
        return self.held_worker_reward / UNIT

    @property
    def case_id_hex(self) -> str:
        return self.case_id.hex()

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> RescueJobView:
        return cls(
            id=int(d["id"]),
            case_id=bytes(d["case_id"]),
            buyer=str(d["buyer"]),
            worker=str(d["worker"]),
            worker_reward=_chain_money(d["worker_reward"], "worker_reward"),
            held_worker_reward=_chain_money(d["held_worker_reward"], "held_worker_reward"),
            result_profile=str(d["result_profile"]),
            result_commitment=bytes(d["result_commitment"]),
            threshold=int(d["threshold"]) if d.get("threshold") is not None else None,
            final_deadline=int(d["final_deadline"]),
            phase=str(d["phase"]),
            raw=d,
        )


@dataclass(frozen=True)
class RescueMandateView:
    """On-chain view of a rescue mandate."""

    job_id: int
    original_cap: int
    held_principal: int
    phase: str
    locked_bundle_id: int | None
    locked_allocation: int | None
    release_reason: str | None
    raw: dict[str, Any]

    @property
    def original_cap_units(self) -> float:
        return self.original_cap / UNIT

    @property
    def held_principal_units(self) -> float:
        return self.held_principal / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> RescueMandateView:
        return cls(
            job_id=int(d["job_id"]),
            original_cap=_chain_money(d["original_cap"], "original_cap"),
            held_principal=_chain_money(d["held_principal"], "held_principal"),
            phase=str(d["phase"]),
            locked_bundle_id=int(d["locked_bundle_id"]) if d.get("locked_bundle_id") is not None else None,
            locked_allocation=_chain_money(d["locked_allocation"], "locked_allocation") if d.get("locked_allocation") is not None else None,
            release_reason=str(d["release_reason"]) if d.get("release_reason") is not None else None,
            raw=d,
        )


@dataclass(frozen=True)
class RescueOfferView:
    """On-chain view of a rescue provider offer."""

    id: int
    case_id: bytes
    component_index: int
    provider: str
    slot_id: str
    fee: int
    bond_capacity: int
    held_bond: int
    phase: str
    locked_bundle_id: int | None
    release_reason: str | None
    raw: dict[str, Any]

    @property
    def fee_units(self) -> float:
        return self.fee / UNIT

    @property
    def held_bond_units(self) -> float:
        return self.held_bond / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> RescueOfferView:
        return cls(
            id=int(d["id"]),
            case_id=bytes(d["case_id"]),
            component_index=int(d["component_index"]),
            provider=str(d["provider"]),
            slot_id=str(d["slot_id"]),
            fee=_chain_money(d["fee"], "fee"),
            bond_capacity=_chain_money(d["bond_capacity"], "bond_capacity"),
            held_bond=_chain_money(d["held_bond"], "held_bond"),
            phase=str(d["phase"]),
            locked_bundle_id=int(d["locked_bundle_id"]) if d.get("locked_bundle_id") is not None else None,
            release_reason=str(d["release_reason"]) if d.get("release_reason") is not None else None,
            raw=d,
        )


@dataclass(frozen=True)
class M3StorageQuote:
    """Authoritative on-chain quote for storage deposit requirements."""

    quote_version: int
    case_storage_bytes: int
    case_storage_cost: int
    job_storage_bytes: int
    job_storage_cost: int
    offer_storage_bytes: int
    offer_storage_cost: int
    raw: dict[str, Any]

    @property
    def job_storage_cost_units(self) -> float:
        return self.job_storage_cost / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> M3StorageQuote:
        return cls(
            quote_version=int(d["quote_version"]),
            case_storage_bytes=int(d["case_storage_bytes"]),
            case_storage_cost=_chain_money(d["case_storage_cost"], "case_storage_cost"),
            job_storage_bytes=int(d["job_storage_bytes"]),
            job_storage_cost=_chain_money(d["job_storage_cost"], "job_storage_cost"),
            offer_storage_bytes=int(d["offer_storage_bytes"]),
            offer_storage_cost=_chain_money(d["offer_storage_cost"], "offer_storage_cost"),
            raw=d,
        )


@dataclass(frozen=True)
class M3Totals:
    """Global Nomogenesis escrow and storage totals."""

    rescue_escrow: int
    storage_reserves: int
    next_rescue_job_id: int
    raw: dict[str, Any]

    @property
    def rescue_escrow_units(self) -> float:
        return self.rescue_escrow / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> M3Totals:
        return cls(
            rescue_escrow=_chain_money(d["rescue_escrow"], "rescue_escrow"),
            storage_reserves=_chain_money(d["storage_reserves"], "storage_reserves"),
            next_rescue_job_id=int(d["next_rescue_job_id"]),
            raw=d,
        )


@dataclass(frozen=True)
class ConsentView:
    """Registered buyer consent view."""

    case_id: bytes
    buyer: str
    nonce: int
    plan_hash: bytes
    max_payment: int
    exact_payment: int
    expires_at: int
    raw: dict[str, Any]

    @property
    def plan_hash_hex(self) -> str:
        return self.plan_hash.hex()

    @property
    def max_payment_units(self) -> float:
        return self.max_payment / UNIT

    @property
    def exact_payment_units(self) -> float:
        return self.exact_payment / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ConsentView:
        return cls(
            case_id=bytes(d["case_id"]),
            buyer=str(d["buyer"]),
            nonce=int(d["nonce"]),
            plan_hash=bytes(d["plan_hash"]),
            max_payment=_chain_money(d["max_payment"], "max_payment"),
            exact_payment=_chain_money(d["exact_payment"], "exact_payment"),
            expires_at=int(d["expires_at"]),
            raw=d,
        )


@dataclass(frozen=True)
class CoalitionPlanView:
    """Evaluated coalition allocation and plan hash."""

    plan_hash: bytes
    selected_job_ids: list[int]
    offer_ids: list[int]
    total_price: int
    payments: list[dict[str, Any]]
    raw: dict[str, Any]

    @property
    def plan_hash_hex(self) -> str:
        return self.plan_hash.hex()

    @property
    def total_price_units(self) -> float:
        return self.total_price / UNIT

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> CoalitionPlanView:
        return cls(
            plan_hash=bytes(d["plan_hash"]),
            selected_job_ids=[int(j) for j in d.get("selected_job_ids", [])],
            offer_ids=[int(o) for o in d.get("offer_ids", [])],
            total_price=_chain_money(d["total_price"], "total_price"),
            payments=list(d.get("payments", [])),
            raw=d,
        )


@dataclass(frozen=True)
class PayoutTotals:
    """Summary of claimable and pending withdrawals."""

    claimable_yocto: int
    pending_yocto: int

    @property
    def claimable_units(self) -> float:
        return self.claimable_yocto / UNIT

    @property
    def pending_units(self) -> float:
        return self.pending_yocto / UNIT


@dataclass(frozen=True)
class UnsignedCall:
    """Specification of a canonical unsigned contract call ready for signing."""

    contract_id: str
    method_name: str
    args: dict[str, Any]
    attached_deposit: str
    gas: str
    deposit_breakdown: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "contract_id": self.contract_id,
            "method_name": self.method_name,
            "args": self.args,
            "attached_deposit": self.attached_deposit,
            "gas": self.gas,
            "deposit_breakdown": self.deposit_breakdown,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


@dataclass(frozen=True)
class AuditReport:
    """Comprehensive verified audit of a Nomogenesis recovery case."""

    network: str
    network_verified: bool
    contract_id: str
    code_hash: str
    code_hash_verified: bool
    case_id: str
    case_phase: str
    case_phase_verified: bool
    merkle_proofs_verified: bool
    component_roots: list[str]
    reconstructed_result: int
    expected_result: int | None
    result_verified: bool
    jobs_completed: bool
    job_statuses: dict[int, str]
    global_claimable_yocto: int
    global_pending_yocto: int
    global_rescue_escrow_yocto: int
    claimable_total_units: float
    pending_total_units: float
    rescue_escrow_units: float
    financial_expectations_verified: bool
    payout_totals_verified: bool
    rescue_escrow_verified: bool
    passed: bool
    errors: list[str] = field(default_factory=list)
    snapshot_block_hash: str | None = None

    def __str__(self) -> str:
        verdict = "PASSED (VERIFIED ON-CHAIN)" if self.passed else "FAILED"
        res_label = f"{self.reconstructed_result}"
        if self.expected_result is not None:
            res_label += f" [{'MATCH' if self.result_verified else 'MISMATCH (expected ' + str(self.expected_result) + ')'}]"
        else:
            res_label += " [AUTHENTICATED FROM ON-CHAIN PAYLOADS]"

        lines = [
            "================================================================================",
            f"  NOMOGENESIS SHIELD AUDIT REPORT — {verdict}",
            "================================================================================",
            f"Network:                   {self.network} [{'VERIFIED' if self.network_verified else 'FAILED'}]",
            f"Snapshot Block:            {self.snapshot_block_hash or 'N/A'}",
            f"Contract ID:               {self.contract_id}",
            f"Deployed Code Hash:        {self.code_hash} [{'MATCH' if self.code_hash_verified else 'MISMATCH'}]",
            f"Case ID:                   {self.case_id}",
            f"Case Phase:                {self.case_phase} [{'CLOSED' if self.case_phase_verified else 'NOT CLOSED'}]",
            f"Merkle Proofs Accepted:    {self.merkle_proofs_verified}",
            f"  Component 0 Root:        {self.component_roots[0] if len(self.component_roots) > 0 else 'N/A'}",
            f"  Component 1 Root:        {self.component_roots[1] if len(self.component_roots) > 1 else 'N/A'}",
            f"Reconstructed Result:      {res_label}",
            f"Worker Jobs Completed:     {self.jobs_completed} {self.job_statuses}",
            "--------------------------------------------------------------------------------",
            "Global Contract Liabilities (Contract-wide metrics, not exclusive to this case):",
            f"  Claimable Total:         {self.claimable_total_units:.4f} UNIT ({self.global_claimable_yocto} yocto)",
            f"  Pending Withdrawals:     {self.pending_total_units:.4f} UNIT ({self.global_pending_yocto} yocto)",
            f"  Rescue Escrow:           {self.rescue_escrow_units:.4f} UNIT ({self.global_rescue_escrow_yocto} yocto)",
            f"  Financial Expectations:  {'VERIFIED' if self.financial_expectations_verified else 'FAILED'}",
            "--------------------------------------------------------------------------------",
        ]
        if self.errors:
            lines.append("Discrepancies / Errors encountered:")
            for err in self.errors:
                lines.append(f"  - {err}")
            lines.append("--------------------------------------------------------------------------------")
        lines.append(f"Overall Audit Status:      {verdict}")
        lines.append("Note: Querying a JSON-RPC endpoint verifies state against the queried node(s),")
        lines.append("      but does not replace running an independent validating PoS node.")
        lines.append("================================================================================")
        return "\n".join(lines)


class Shield:
    """Nomogenesis Shield public interface for verifying recovery markets on NEAR Protocol."""

    def __init__(
        self,
        network: str = "testnet",
        contract_id: str | None = None,
        rpc_endpoints: Sequence[str] | str | None = None,
        timeout_seconds: float = 15.0,
        expected_code_hash: str | None = None,
    ) -> None:
        if network == "testnet":
            endpoints = rpc_endpoints or DEFAULT_TESTNET_RPCS
            contract_id = contract_id or DEFAULT_TESTNET_CONTRACT
            expected_code_hash = expected_code_hash or DEFAULT_EXPECTED_CODE_HASH
        elif network == "mainnet":
            endpoints = rpc_endpoints or DEFAULT_MAINNET_RPCS
            if contract_id is None:
                raise ValidationError(
                    "contract_id must be explicitly configured for mainnet (no default contract exists)"
                )
            if expected_code_hash is None:
                raise ValidationError(
                    "expected_code_hash must be explicitly configured for mainnet (no default code hash exists)"
                )
        else:
            raise ValidationError(
                f"Unsupported network: '{network}'. Only 'testnet' and 'mainnet' are supported."
            )

        validate_account_id(contract_id, "contract_id")

        self.network = network
        self.contract_id = contract_id
        self.expected_code_hash = expected_code_hash
        self.rpc = NearRpcClient(endpoints=endpoints, timeout_seconds=timeout_seconds)

    def verify_network(self, expected_network: str | None = None) -> bool:
        """
        Verify that the RPC transport connects to the declared network/chain_id.
        """
        target = expected_network or self.network
        status = self.rpc.get_status()
        chain_id = status.get("chain_id")
        if chain_id != target:
            raise VerificationError(
                f"Network mismatch: client configured for '{target}', but RPC reported chain_id '{chain_id}'"
            )
        return True

    def verify_deployed_code(self, expected_code_hash: str | None = None) -> bool:
        """
        Verify that the contract deployed on-chain matches the expected code hash.
        """
        target = expected_code_hash or self.expected_code_hash
        current_hash = self.rpc.view_code(self.contract_id)
        if current_hash != target:
            raise VerificationError(
                f"Contract code hash mismatch for {self.contract_id}: "
                f"expected {target}, found {current_hash}"
            )
        return True

    def get_rescue_case(self, case_id: str | bytes | Sequence[int]) -> RescueCaseView | None:
        """Fetch rescue case view from contract state."""
        cid = to_case_id_bytes(case_id)
        res = self.rpc.view_function(
            self.contract_id,
            "get_rescue_case",
            {"case_id": list(cid)},
        )
        if res is None:
            return None
        return RescueCaseView.from_dict(res)

    def has_rescue_case(self, case_id: str | bytes | Sequence[int]) -> bool:
        """Check whether rescue case exists in contract state."""
        cid = to_case_id_bytes(case_id)
        res = self.rpc.view_function(
            self.contract_id,
            "has_rescue_case",
            {"case_id": list(cid)},
        )
        return bool(res)

    def get_rescue_job(self, job_id: int) -> RescueJobView | None:
        """Fetch rescue job view by identifier."""
        jid = validate_u64(job_id, "job_id")
        res = self.rpc.view_function(
            self.contract_id,
            "get_rescue_job",
            {"job_id": jid},
        )
        if res is None:
            return None
        return RescueJobView.from_dict(res)

    def has_rescue_job(self, job_id: int) -> bool:
        """Check whether rescue job exists."""
        jid = validate_u64(job_id, "job_id")
        return bool(self.rpc.view_function(self.contract_id, "has_rescue_job", {"job_id": jid}))

    def get_rescue_mandate(self, job_id: int) -> RescueMandateView | None:
        """Fetch rescue mandate view by job identifier."""
        jid = validate_u64(job_id, "job_id")
        res = self.rpc.view_function(
            self.contract_id,
            "get_rescue_mandate",
            {"job_id": jid},
        )
        if res is None:
            return None
        return RescueMandateView.from_dict(res)

    def has_rescue_mandate(self, job_id: int) -> bool:
        """Check whether rescue mandate exists."""
        jid = validate_u64(job_id, "job_id")
        return bool(self.rpc.view_function(self.contract_id, "has_rescue_mandate", {"job_id": jid}))

    def get_rescue_offer(self, offer_id: int) -> RescueOfferView | None:
        """Fetch rescue provider offer by identifier."""
        oid = validate_u64(offer_id, "offer_id")
        res = self.rpc.view_function(
            self.contract_id,
            "get_rescue_offer",
            {"offer_id": oid},
        )
        if res is None:
            return None
        return RescueOfferView.from_dict(res)

    def has_rescue_offer(self, offer_id: int) -> bool:
        """Check whether rescue provider offer exists."""
        oid = validate_u64(offer_id, "offer_id")
        return bool(self.rpc.view_function(self.contract_id, "has_rescue_offer", {"offer_id": oid}))

    def get_claimable(self, account_id: str) -> int:
        """Query claimable yoctoNEAR balance for designated account."""
        acc = validate_account_id(account_id, "account_id")
        res = self.rpc.view_function(
            self.contract_id,
            "get_claimable",
            {"account": acc},
        )
        return _chain_money(res, "contract_balance")

    def claimable_total(self) -> int:
        """Query aggregate claimable yoctoNEAR across all contract accounts."""
        res = self.rpc.view_function(self.contract_id, "claimable_total")
        return _chain_money(res, "contract_balance")

    def payout_totals(self) -> PayoutTotals:
        """Query aggregate claimable and pending withdrawal totals."""
        res = self.rpc.view_function(self.contract_id, "payout_totals")
        if isinstance(res, (list, tuple)) and len(res) == 2:
            return PayoutTotals(
                claimable_yocto=_chain_money(res[0], "claimable"),
                pending_yocto=_chain_money(res[1], "pending"),
            )
        raise ContractError(f"Unexpected payout_totals shape: {res}")

    def m3_totals(self) -> M3Totals:
        """Query global rescue escrow and storage totals."""
        res = self.rpc.view_function(self.contract_id, "m3_totals")
        return M3Totals.from_dict(res)

    def rescue_escrow_total(self) -> int:
        """Query active rescue escrow in yoctoNEAR."""
        res = self.rpc.view_function(self.contract_id, "rescue_escrow_total")
        return _chain_money(res, "contract_balance")

    def m3_storage_quote(self) -> M3StorageQuote:
        """Fetch authoritative storage cost quote for cases, jobs, and offers."""
        res = self.rpc.view_function(self.contract_id, "m3_storage_quote")
        return M3StorageQuote.from_dict(res)

    def quote_r7_v2_consent_storage(self) -> int:
        """Fetch authoritative storage deposit quote for registering a buyer consent."""
        res = self.rpc.view_function(self.contract_id, "quote_r7_v2_consent_storage")
        return _chain_money(res, "consent_storage_quote")

    def get_r7_v2_consent(self, job_id: int) -> ConsentView | None:
        """Fetch registered buyer consent for a job."""
        jid = validate_u64(job_id, "job_id")
        res = self.rpc.view_function(
            self.contract_id,
            "get_r7_v2_consent",
            {"job_id": jid},
        )
        if res is None:
            return None
        return ConsentView.from_dict(res)

    def is_r7_v2_nonce_used(self, buyer: str, nonce: int) -> bool:
        """Check whether buyer nonce has already been consumed."""
        acc = validate_account_id(buyer, "buyer")
        n = validate_u64(nonce, "nonce")
        res = self.rpc.view_function(
            self.contract_id,
            "is_r7_v2_nonce_used",
            {"buyer": acc, "nonce": n},
        )
        return bool(res)

    def preview_r7_v2_coalition(
        self,
        case_id: str | bytes | Sequence[int],
        selected_job_ids: Sequence[int],
    ) -> CoalitionPlanView:
        """
        Preview candidate coalition plan and calculate canonical plan hash for active market.
        Note: Will revert on closed or expired markets.
        """
        cid = to_case_id_bytes(case_id)
        job_ids = [validate_u64(j, "selected_job_id") for j in selected_job_ids]
        if not job_ids:
            raise ValidationError("selected_job_ids cannot be empty")
        res = self.rpc.view_function(
            self.contract_id,
            "preview_r7_v2_coalition",
            {"case_id": list(cid), "selected_job_ids": job_ids},
        )
        return CoalitionPlanView.from_dict(res)

    def build_funding_call(
        self,
        case_id: str | bytes | Sequence[int],
        worker: str,
        worker_reward_yocto: int | str,
        rescue_cap_yocto: int | str,
        threshold: int | str,
        final_deadline_ns: int,
        job_storage_cost_yocto: int | str | None = None,
    ) -> UnsignedCall:
        """
        Build canonical, unsigned transaction call specification for create_funded_rescue_job.

        Calculates:
          - Canonical JSON input shape matching contract ABI
          - Domain-separated result commitment
          - Exact attached deposit (worker_reward + rescue_cap + storage_quote)
          - Standard gas attachment
        """
        cid = to_case_id_bytes(case_id)
        w_acc = validate_account_id(worker, "worker")
        w_reward = validate_u128(worker_reward_yocto, "worker_reward_yocto", allow_zero=False)
        r_cap = validate_u128(rescue_cap_yocto, "rescue_cap_yocto", allow_zero=False)
        thresh = validate_u128(threshold, "threshold", allow_zero=False)
        deadline = validate_u64(final_deadline_ns, "final_deadline_ns", allow_zero=False)

        if deadline % SECOND_NS != 0:
            raise ValidationError("final_deadline_ns must be aligned to whole seconds")

        if job_storage_cost_yocto is None:
            storage_cost = self.m3_storage_quote().job_storage_cost
        else:
            storage_cost = validate_u128(job_storage_cost_yocto, "job_storage_cost_yocto")

        commitment = minimum_commitment(cid, thresh)
        total_deposit = validate_u128(
            w_reward + r_cap + storage_cost,
            "total_attached_deposit",
            allow_zero=False,
        )

        input_payload = {
            "case_id": list(cid),
            "worker": w_acc,
            "worker_reward": str(w_reward),
            "rescue_cap": str(r_cap),
            "result_profile": "MinimumThreshold",
            "result_commitment": list(commitment),
            "threshold": str(thresh),
            "final_deadline": deadline,
        }

        return UnsignedCall(
            contract_id=self.contract_id,
            method_name="create_funded_rescue_job",
            args={"input": input_payload},
            attached_deposit=str(total_deposit),
            gas=GAS_FUNDING_YOCTO,
            deposit_breakdown={
                "worker_reward_yocto": str(w_reward),
                "rescue_cap_yocto": str(r_cap),
                "storage_deposit_yocto": str(storage_cost),
                "total_attached_deposit_yocto": str(total_deposit),
            },
        )

    def build_consent_call(
        self,
        case_id: str | bytes | Sequence[int],
        job_id: int,
        buyer: str,
        nonce: int,
        plan_hash: str | bytes | Sequence[int],
        max_payment_yocto: int | str,
        exact_payment_yocto: int | str,
        expires_at_ns: int,
        consent_storage_cost_yocto: int | str | None = None,
    ) -> UnsignedCall:
        """
        Build canonical, unsigned transaction call specification for register_r7_v2_consent.
        """
        cid = to_case_id_bytes(case_id)
        jid = validate_u64(job_id, "job_id")
        b_acc = validate_account_id(buyer, "buyer")
        n = validate_u64(nonce, "nonce")
        phash = to_bytes32(plan_hash, "plan_hash")
        max_p = validate_u128(max_payment_yocto, "max_payment_yocto", allow_zero=False)
        exact_p = validate_u128(exact_payment_yocto, "exact_payment_yocto", allow_zero=False)
        exp = validate_u64(expires_at_ns, "expires_at_ns", allow_zero=False)

        if exact_p > max_p:
            raise ValidationError(
                f"exact_payment ({exact_p}) cannot exceed max_payment ({max_p})"
            )

        if consent_storage_cost_yocto is None:
            storage_cost = self.quote_r7_v2_consent_storage()
        else:
            storage_cost = validate_u128(consent_storage_cost_yocto, "consent_storage_cost_yocto")

        input_payload = {
            "case_id": list(cid),
            "contract": self.contract_id,
            "domain": CONSENT_DOMAIN,
            "job_id": jid,
            "buyer": b_acc,
            "nonce": n,
            "plan_hash": list(phash),
            "max_payment": str(max_p),
            "exact_payment": str(exact_p),
            "expires_at": exp,
        }

        return UnsignedCall(
            contract_id=self.contract_id,
            method_name="register_r7_v2_consent",
            args={"input": input_payload},
            attached_deposit=str(storage_cost),
            gas=GAS_CONSENT_YOCTO,
            deposit_breakdown={
                "consent_storage_deposit_yocto": str(storage_cost),
                "total_attached_deposit_yocto": str(storage_cost),
            },
        )

    def audit_case(
        self,
        case_id: str | bytes | Sequence[int],
        expected_code_hash: str | None = None,
        expected_result: int | str | None = None,
        expected_claimable_yocto: int | str | None = None,
        expected_pending_yocto: int | str | None = None,
        expected_escrow_yocto: int | str | None = None,
    ) -> AuditReport:
        """Audit one consistent finalized blockchain snapshot."""
        with self.rpc.finalized_snapshot() as block_hash:
            report = self._audit_case_at_block(
                case_id=case_id,
                expected_code_hash=expected_code_hash,
                expected_result=expected_result,
                expected_claimable_yocto=expected_claimable_yocto,
                expected_pending_yocto=expected_pending_yocto,
                expected_escrow_yocto=expected_escrow_yocto,
            )
            return replace(report, snapshot_block_hash=block_hash)

    def _audit_case_at_block(
        self,
        case_id: str | bytes | Sequence[int],
        expected_code_hash: str | None = None,
        expected_result: int | str | None = None,
        expected_claimable_yocto: int | str | None = None,
        expected_pending_yocto: int | str | None = None,
        expected_escrow_yocto: int | str | None = None,
    ) -> AuditReport:
        """
        Perform an independent, read-only on-chain audit of a completed Nomogenesis rescue case.

        This method verifies:
          1. Network identity matches configured network via RPC node status query.
          2. Deployed contract bytecode matches expected SHA-256 hash.
          3. Rescue case exists and is in 'Closed' terminal phase with an awarded bundle.
          4. Both resolved component payloads authenticate against on-chain Merkle commitments.
          5. Dynamically reconstructs Quantity x Price total from authenticated components.
             If expected_result is provided, verifies exact match.
          6. All jobs designated in case.job_ids are in 'Completed' phase with 0 held reward.
          7. Records contract-wide global financial metrics (claimable, pending, rescue escrow).
             If explicit expectations are provided (e.g. for historical regression), verifies them.
        """
        errors: list[str] = []
        cid = to_case_id_bytes(case_id)
        cid_hex = cid.hex()

        # 1. Network / chain identity verification
        network_verified = False
        try:
            self.verify_network()
            network_verified = True
        except Exception as exc:
            errors.append(f"Network verification failed: {exc}")

        # Never query contract state after a chain identity mismatch.
        if not network_verified:
            return AuditReport(
                network=self.network,
                network_verified=False,
                contract_id=self.contract_id,
                code_hash="",
                code_hash_verified=False,
                case_id=cid_hex,
                case_phase="Unknown",
                case_phase_verified=False,
                merkle_proofs_verified=False,
                component_roots=[],
                reconstructed_result=0,
                expected_result=(
                    validate_u128(expected_result, "expected_result")
                    if expected_result is not None else None
                ),
                result_verified=False,
                jobs_completed=False,
                job_statuses={},
                global_claimable_yocto=0,
                global_pending_yocto=0,
                global_rescue_escrow_yocto=0,
                claimable_total_units=0.0,
                pending_total_units=0.0,
                rescue_escrow_units=0.0,
                financial_expectations_verified=False,
                payout_totals_verified=False,
                rescue_escrow_verified=False,
                passed=False,
                errors=errors,
            )

        # 2. Deployed code hash verification
        target_code_hash = expected_code_hash or self.expected_code_hash
        code_hash = ""
        code_hash_verified = False
        try:
            code_hash = self.rpc.view_code(self.contract_id)
            if code_hash == target_code_hash:
                code_hash_verified = True
            else:
                errors.append(
                    f"Contract code hash mismatch: expected {target_code_hash}, got {code_hash}"
                )
        except Exception as exc:
            errors.append(f"Failed to query contract code hash: {exc}")

        # 3. Case lookup
        case = self.get_rescue_case(cid)
        if case is None:
            errors.append(f"Rescue case '{cid_hex}' does not exist on contract {self.contract_id}")
            return AuditReport(
                network=self.network,
                network_verified=network_verified,
                contract_id=self.contract_id,
                code_hash=code_hash,
                code_hash_verified=code_hash_verified,
                case_id=cid_hex,
                case_phase="Unknown",
                case_phase_verified=False,
                merkle_proofs_verified=False,
                component_roots=[],
                reconstructed_result=0,
                expected_result=int(expected_result) if expected_result is not None else None,
                result_verified=False,
                jobs_completed=False,
                job_statuses={},
                global_claimable_yocto=0,
                global_pending_yocto=0,
                global_rescue_escrow_yocto=0,
                claimable_total_units=0.0,
                pending_total_units=0.0,
                rescue_escrow_units=0.0,
                financial_expectations_verified=False,
                payout_totals_verified=False,
                rescue_escrow_verified=False,
                passed=False,
                errors=errors,
            )

        case_phase_verified = case.phase == "Closed"
        if not case_phase_verified:
            errors.append(f"Case phase is '{case.phase}', expected 'Closed'")

        if case.awarded_bundle_id is None:
            errors.append("Case has no awarded recovery bundle recorded")

        # 4. Merkle proof verification of both component payloads
        merkle_proofs_verified = True
        component_roots: list[str] = []

        if len(case.resolved_payloads) < 2 or any(p is None for p in case.resolved_payloads[:2]):
            merkle_proofs_verified = False
            errors.append("Case has incomplete resolved component payloads")
        elif len(case.component_commitments) < 2:
            merkle_proofs_verified = False
            errors.append("Case has incomplete component commitments")
        else:
            for kind in (0, 1):
                payload = case.resolved_payloads[kind]
                expected_commitment = case.component_commitments[kind]
                component_roots.append(expected_commitment.hex())

                if payload is None or not verify_component_merkle(kind, payload, expected_commitment):
                    merkle_proofs_verified = False
                    errors.append(f"Component {kind} failed independent Merkle verification against on-chain root")

        # 5. Dynamic result reconstruction
        reconstructed_result = 0
        result_verified = False
        if merkle_proofs_verified and case.resolved_payloads[0] and case.resolved_payloads[1]:
            try:
                reconstructed_result = reconstruct_total(
                    case.resolved_payloads[0], case.resolved_payloads[1]
                )
                if expected_result is not None:
                    exp_val = validate_u128(expected_result, "expected_result")
                    if reconstructed_result == exp_val:
                        result_verified = True
                    else:
                        errors.append(
                            f"Reconstructed result {reconstructed_result} does not match expected {exp_val}"
                        )
                else:
                    # Dynamic result successfully authenticated
                    result_verified = True
            except VerificationError as exc:
                errors.append(f"Result reconstruction failed: {exc}")
        else:
            errors.append("Skipped result reconstruction due to unverified component payloads")

        # 6. Worker jobs completion checks
        job_statuses: dict[int, str] = {}
        jobs_completed = True
        if not case.job_ids:
            jobs_completed = False
            errors.append("Rescue case has no associated job IDs recorded")
        else:
            for jid in case.job_ids:
                job = self.get_rescue_job(jid)
                if job is None:
                    job_statuses[jid] = "Missing"
                    jobs_completed = False
                    errors.append(f"Job {jid} listed in case but missing from contract state")
                else:
                    job_statuses[jid] = job.phase
                    if job.phase != "Completed" or job.held_worker_reward != 0:
                        jobs_completed = False
                        errors.append(
                            f"Job {jid} phase is '{job.phase}' with held_reward {job.held_worker_reward} (expected Completed with 0 held reward)"
                        )
                    if job.case_id != cid:
                        jobs_completed = False
                        errors.append(
                            f"Job {jid} references case {job.case_id.hex()}, expected {cid_hex}"
                        )

        # 7. Global financial queries and optional expectations
        financial_expectations_verified = True
        global_claimable_yocto = 0
        global_pending_yocto = 0
        try:
            payouts = self.payout_totals()
            global_claimable_yocto = payouts.claimable_yocto
            global_pending_yocto = payouts.pending_yocto

            if expected_claimable_yocto is not None:
                exp_claim = validate_u128(expected_claimable_yocto, "expected_claimable_yocto")
                if payouts.claimable_yocto != exp_claim:
                    financial_expectations_verified = False
                    errors.append(
                        f"Global claimable total mismatch: expected {exp_claim} yocto, found {payouts.claimable_yocto} yocto"
                    )

            if expected_pending_yocto is not None:
                exp_pend = validate_u128(expected_pending_yocto, "expected_pending_yocto")
                if payouts.pending_yocto != exp_pend:
                    financial_expectations_verified = False
                    errors.append(
                        f"Global pending total mismatch: expected {exp_pend} yocto, found {payouts.pending_yocto} yocto"
                    )
        except Exception as exc:
            financial_expectations_verified = False
            errors.append(f"Failed to query payout_totals: {exc}")

        global_rescue_escrow_yocto = 0
        try:
            global_rescue_escrow_yocto = self.rescue_escrow_total()
            if expected_escrow_yocto is not None:
                exp_escrow = validate_u128(expected_escrow_yocto, "expected_escrow_yocto")
                if global_rescue_escrow_yocto != exp_escrow:
                    financial_expectations_verified = False
                    errors.append(
                        f"Global rescue escrow mismatch: expected {exp_escrow} yocto, found {global_rescue_escrow_yocto} yocto"
                    )
        except Exception as exc:
            financial_expectations_verified = False
            errors.append(f"Failed to query rescue_escrow_total: {exc}")

        passed = (
            network_verified
            and code_hash_verified
            and case_phase_verified
            and merkle_proofs_verified
            and result_verified
            and jobs_completed
            and financial_expectations_verified
            and len(errors) == 0
        )

        return AuditReport(
            network=self.network,
            network_verified=network_verified,
            contract_id=self.contract_id,
            code_hash=code_hash,
            code_hash_verified=code_hash_verified,
            case_id=cid_hex,
            case_phase=case.phase,
            case_phase_verified=case_phase_verified,
            merkle_proofs_verified=merkle_proofs_verified,
            component_roots=component_roots,
            reconstructed_result=reconstructed_result,
            expected_result=int(expected_result) if expected_result is not None else None,
            result_verified=result_verified,
            jobs_completed=jobs_completed,
            job_statuses=job_statuses,
            global_claimable_yocto=global_claimable_yocto,
            global_pending_yocto=global_pending_yocto,
            global_rescue_escrow_yocto=global_rescue_escrow_yocto,
            claimable_total_units=global_claimable_yocto / UNIT,
            pending_total_units=global_pending_yocto / UNIT,
            rescue_escrow_units=global_rescue_escrow_yocto / UNIT,
            financial_expectations_verified=financial_expectations_verified,
            payout_totals_verified=financial_expectations_verified,
            rescue_escrow_verified=financial_expectations_verified,
            passed=passed,
            errors=errors,
        )

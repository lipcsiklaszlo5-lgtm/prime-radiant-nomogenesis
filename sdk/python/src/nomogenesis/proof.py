"""Cryptographic Merkle verification and deterministic arithmetic for Nomogenesis."""

from __future__ import annotations

import hashlib
import re
from decimal import Decimal
from typing import Any, Sequence

from .exceptions import ValidationError, VerificationError

UNIT: int = 10**21
U128_MAX: int = (1 << 128) - 1
U64_MAX: int = (1 << 64) - 1
U32_MAX: int = (1 << 32) - 1
U16_MAX: int = (1 << 16) - 1
SECOND_NS: int = 1_000_000_000

MAX_COMPONENT_PAYLOAD_BYTES: int = 256
MIN_COMPONENT_PAYLOAD_BYTES: int = 13
MAX_RECORDS_PER_COMPONENT: int = 16

EXACT_SUM_PROFILE: int = 0x21
MINIMUM_SUM_PROFILE: int = 0x22

PLAN_DOMAIN: bytes = b"NOMOGENESIS/R7-06E/PLAN/V3"
CONSENT_DOMAIN: str = "NOMOGENESIS/R7-06E/SUBSET/V1"
EXACT_SUM_DOMAIN: bytes = b"NOMOGENESIS/M3/EXACT-SUM/V1\0"
MINIMUM_SUM_DOMAIN: bytes = b"NOMOGENESIS/M3/MIN-SUM/V1\0"

_NEAR_ACCOUNT_RE = re.compile(r"^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$")
_CANONICAL_DECIMAL_RE = re.compile(r"^(0|[1-9][0-9]*)$")


def sha256(data: bytes) -> bytes:
    """Compute SHA-256 digest of input bytes."""
    return hashlib.sha256(data).digest()


def u64_be(val: int) -> bytes:
    """Encode integer as 8-byte big-endian."""
    return val.to_bytes(8, byteorder="big", signed=False)


def u32_be(val: int) -> bytes:
    """Encode integer as 4-byte big-endian."""
    return val.to_bytes(4, byteorder="big", signed=False)


def u16_be(val: int) -> bytes:
    """Encode integer as 2-byte big-endian."""
    return val.to_bytes(2, byteorder="big", signed=False)


def u128_be(val: int) -> bytes:
    """Encode integer as 16-byte big-endian."""
    return val.to_bytes(16, byteorder="big", signed=False)


def validate_account_id(account_id: str, field_name: str = "account_id") -> str:
    """Validate NEAR account identifier format."""
    if not isinstance(account_id, str):
        raise ValidationError(f"{field_name} must be a string, got {type(account_id).__name__}")
    if len(account_id) < 2 or len(account_id) > 64:
        raise ValidationError(f"{field_name} length must be between 2 and 64 characters")
    if not _NEAR_ACCOUNT_RE.match(account_id):
        raise ValidationError(f"{field_name} contains invalid characters: '{account_id}'")
    return account_id


def validate_u128(value: Any, field_name: str = "value", allow_zero: bool = True) -> int:
    """Validate and convert unsigned 128-bit integer. Rejects booleans, floats, NaN, Inf, and fractional yocto."""
    if isinstance(value, bool):
        raise ValidationError(f"{field_name} cannot be a boolean, got {value}")
    if isinstance(value, float):
        raise ValidationError(
            f"{field_name} cannot be a float (ambiguous precision). Use int, Decimal, or canonical decimal string."
        )

    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValidationError(f"{field_name} must be a finite Decimal, got {value}")
        if value.to_integral_value() != value:
            raise ValidationError(f"{field_name} cannot have fractional yoctoNEAR, got {value}")
        num = int(value)
    elif isinstance(value, str):
        if not _CANONICAL_DECIMAL_RE.match(value):
            raise ValidationError(f"{field_name} must be a canonical decimal string, got '{value}'")
        num = int(value)
    elif isinstance(value, int):
        num = value
    else:
        raise ValidationError(f"{field_name} must be int, Decimal, or decimal string, got {type(value).__name__}")

    if num < 0 or num > U128_MAX:
        raise ValidationError(f"{field_name} out of u128 bounds [0, 2^128-1]: {num}")
    if not allow_zero and num == 0:
        raise ValidationError(f"{field_name} must be strictly positive")
    return num


def validate_u64(value: Any, field_name: str = "value", allow_zero: bool = True) -> int:
    """Validate and convert unsigned 64-bit integer. Rejects booleans, floats, NaN, Inf, and non-integers."""
    if isinstance(value, bool):
        raise ValidationError(f"{field_name} cannot be a boolean, got {value}")
    if isinstance(value, float):
        raise ValidationError(
            f"{field_name} cannot be a float (ambiguous precision). Use int, Decimal, or canonical decimal string."
        )

    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValidationError(f"{field_name} must be a finite Decimal, got {value}")
        if value.to_integral_value() != value:
            raise ValidationError(f"{field_name} cannot have fractional part, got {value}")
        num = int(value)
    elif isinstance(value, str):
        if not _CANONICAL_DECIMAL_RE.match(value):
            raise ValidationError(f"{field_name} must be a canonical decimal string, got '{value}'")
        num = int(value)
    elif isinstance(value, int):
        num = value
    else:
        raise ValidationError(f"{field_name} must be int, Decimal, or decimal string, got {type(value).__name__}")

    if num < 0 or num > U64_MAX:
        raise ValidationError(f"{field_name} out of u64 bounds [0, 2^64-1]: {num}")
    if not allow_zero and num == 0:
        raise ValidationError(f"{field_name} must be strictly positive")
    return num



def unit_to_yocto(amount_in_units: Any, field_name: str = "amount") -> int:
    """Exact UNIT to yocto conversion without Decimal context rounding."""
    if isinstance(amount_in_units, (bool, float)):
        raise ValidationError(f"{field_name}: boolean/float forbidden")

    if isinstance(amount_in_units, Decimal):
        d = amount_in_units
    elif isinstance(amount_in_units, (str, int)):
        try:
            d = Decimal(str(amount_in_units))
        except Exception as exc:
            raise ValidationError(f"{field_name}: invalid decimal") from exc
    else:
        raise ValidationError(f"{field_name}: unsupported type")

    if not d.is_finite() or d < 0:
        raise ValidationError(f"{field_name}: invalid amount")
    if d.is_zero():
        return 0

    sign, digits, exponent = d.as_tuple()
    if sign or len(digits) > 256:
        raise ValidationError(f"{field_name}: invalid representation")

    coefficient = int("".join(map(str, digits)))
    shift = exponent + 21

    if shift >= 0:
        if len(digits) + shift > 39:
            raise ValidationError(f"{field_name}: U128 overflow")
        result = coefficient * 10 ** shift
    else:
        places = -shift
        if places > len(digits):
            raise ValidationError(
                f"{field_name}: fractional yoctoNEAR"
            )
        divisor = 10 ** places
        result, remainder = divmod(coefficient, divisor)
        if remainder:
            raise ValidationError(
                f"{field_name}: fractional yoctoNEAR"
            )

    return validate_u128(result, field_name)


def yocto_to_unit_decimal(yocto: int) -> Decimal:
    """Exact conversion, including all 21 fractional UNIT digits."""
    value = validate_u128(yocto, "yocto")
    whole, fraction = divmod(value, UNIT)
    return Decimal(f"{whole}.{fraction:021d}")


def to_bytes32(data: str | bytes | Sequence[int], field_name: str = "hash") -> bytes:
    """Convert hex string, byte sequence, or integer list into exact 32-byte bytes."""
    if isinstance(data, str):
        clean = data.removeprefix("0x")
        if len(clean) != 64:
            raise ValidationError(f"{field_name} hex string must represent 32 bytes (64 hex chars), got {len(clean)}")
        try:
            raw = bytes.fromhex(clean)
        except ValueError as exc:
            raise ValidationError(f"{field_name} contains invalid hex characters: {exc}") from exc
    elif isinstance(data, (bytes, bytearray)):
        raw = bytes(data)
    elif isinstance(data, (list, tuple)):
        for item in data:
            if not isinstance(item, int) or item < 0 or item > 255:
                raise ValidationError(f"Invalid byte in {field_name}: {item}")
        raw = bytes(data)
    else:
        raise ValidationError(f"{field_name} must be hex str, bytes, or list[int], got {type(data).__name__}")

    if len(raw) != 32:
        raise ValidationError(f"{field_name} must be exactly 32 bytes, got {len(raw)}")
    return raw


def to_case_id_bytes(case_id: str | bytes | Sequence[int]) -> bytes:
    """Convert and validate 32-byte rescue case identifier."""
    return to_bytes32(case_id, field_name="case_id")


def validate_component_payload(component_kind: int, payload: bytes) -> None:
    """
    Validate binary component payload according to Nomogenesis on-chain specification:
      - component_kind in {0, 1}
      - length in [13, 256]
      - payload[0] == 1 (format version)
      - payload[1] == component_kind + 1
      - count in [1, 16]
      - length == 3 + 10 * count
      - strictly ascending u16 item IDs
    """
    if component_kind not in (0, 1):
        raise ValidationError(f"invalid component_kind: {component_kind}; expected 0 or 1")

    if not isinstance(payload, (bytes, bytearray)):
        raise ValidationError(f"payload must be bytes, got {type(payload).__name__}")

    if len(payload) < MIN_COMPONENT_PAYLOAD_BYTES or len(payload) > MAX_COMPONENT_PAYLOAD_BYTES:
        raise VerificationError(
            f"invalid component payload length: {len(payload)} bytes; "
            f"must be between {MIN_COMPONENT_PAYLOAD_BYTES} and {MAX_COMPONENT_PAYLOAD_BYTES}"
        )

    if payload[0] != 1:
        raise VerificationError(f"invalid component header version: {payload[0]}; expected 1")

    expected_kind_byte = component_kind + 1
    if payload[1] != expected_kind_byte:
        raise VerificationError(
            f"invalid component header kind: expected {expected_kind_byte}, got {payload[1]}"
        )

    count = int(payload[2])
    if count < 1 or count > MAX_RECORDS_PER_COMPONENT:
        raise VerificationError(
            f"invalid component record count: {count}; must be in 1..={MAX_RECORDS_PER_COMPONENT}"
        )

    expected_len = 3 + 10 * count
    if len(payload) != expected_len:
        raise VerificationError(
            f"component record count mismatch: header specifies {count} records "
            f"(expected {expected_len} bytes), but got {len(payload)} bytes"
        )

    prev_id = -1
    for i in range(count):
        offset = 3 + 10 * i
        item_id = int.from_bytes(payload[offset : offset + 2], byteorder="big", signed=False)
        if item_id <= prev_id:
            raise VerificationError(
                f"component items not strictly ascending at index {i}: item_id {item_id} <= previous {prev_id}"
            )
        prev_id = item_id


def component_metadata_sibling(component_kind: int) -> bytes:
    """
    Compute canonical metadata sibling for component Merkle leaf.
    Formula: SHA256(0x00 || u64_be(1) || u32_be(3) || [0x01, 0x7f, component_kind + 1])
    """
    if component_kind not in (0, 1):
        raise ValidationError(f"invalid component_kind: {component_kind}; expected 0 or 1")
    metadata = bytes([1, 0x7F, component_kind + 1])
    return sha256(b"\x00" + u64_be(1) + u32_be(3) + metadata)


def compute_component_root(component_kind: int, payload: bytes) -> bytes:
    """
    Compute 32-byte Merkle commitment root for a component payload.
      leaf0 = SHA256(0x00 || u64_be(0) || u32_be(payload_length) || payload)
      leaf1 = component_metadata_sibling(component_kind)
      root  = SHA256(0x01 || leaf0 || leaf1)
    """
    validate_component_payload(component_kind, payload)
    leaf0 = sha256(b"\x00" + u64_be(0) + u32_be(len(payload)) + payload)
    leaf1 = component_metadata_sibling(component_kind)
    return sha256(b"\x01" + leaf0 + leaf1)


def verify_component_merkle(
    component_kind: int,
    payload: bytes,
    expected_root: str | bytes | Sequence[int],
) -> bool:
    """
    Independently verify component payload against expected on-chain Merkle commitment root.
    Returns True if valid, False if tampered or mismatched.
    """
    try:
        expected = to_bytes32(expected_root, field_name="expected_root")
        computed = compute_component_root(component_kind, payload)
        return computed == expected
    except (VerificationError, ValidationError):
        return False


def parse_component_records(payload: bytes, component_kind: int | None = None) -> list[tuple[int, int]]:
    """Parse valid component binary payload into list of (item_id, value) tuples."""
    if component_kind is not None:
        validate_component_payload(component_kind, payload)
    elif len(payload) < 3:
        raise VerificationError("payload too short for header")

    count = int(payload[2])
    records: list[tuple[int, int]] = []
    for i in range(count):
        offset = 3 + 10 * i
        item_id = int.from_bytes(payload[offset : offset + 2], byteorder="big", signed=False)
        val = int.from_bytes(payload[offset + 2 : offset + 10], byteorder="big", signed=False)
        records.append((item_id, val))
    return records


def encode_component_payload(component_kind: int, records: Sequence[tuple[int, int]]) -> bytes:
    """Encode list of (item_id, value) tuples into canonical Nomogenesis component binary payload."""
    if component_kind not in (0, 1):
        raise ValidationError(f"invalid component_kind: {component_kind}")
    count = len(records)
    if count < 1 or count > MAX_RECORDS_PER_COMPONENT:
        raise ValidationError(f"record count must be between 1 and {MAX_RECORDS_PER_COMPONENT}, got {count}")

    buf = bytearray(3 + 10 * count)
    buf[0] = 1
    buf[1] = component_kind + 1
    buf[2] = count

    prev_id = -1
    for i, (item_id, val) in enumerate(records):
        if not isinstance(item_id, int) or item_id < 0 or item_id > U16_MAX:
            raise ValidationError(f"item_id at {i} out of u16 range: {item_id}")
        if item_id <= prev_id:
            raise ValidationError(f"item_id at {i} not strictly ascending: {item_id} <= {prev_id}")
        if not isinstance(val, int) or val < 0 or val > U64_MAX:
            raise ValidationError(f"value at {i} out of u64 range: {val}")
        prev_id = item_id

        offset = 3 + 10 * i
        buf[offset : offset + 2] = item_id.to_bytes(2, "big")
        buf[offset + 2 : offset + 10] = val.to_bytes(8, "big")

    return bytes(buf)


def reconstruct_total(quantities_payload: bytes, prices_payload: bytes) -> int:
    """
    Deterministically reconstruct quantity * unit_price total from authenticated components.
    Checks:
      - Valid component 0 (quantities) and component 1 (prices) payloads
      - Identical record counts
      - Strictly matching item IDs in ascending order
      - Unchecked u128 multiplication and addition overflow prevention
    """
    validate_component_payload(0, quantities_payload)
    validate_component_payload(1, prices_payload)

    if quantities_payload[2] != prices_payload[2]:
        raise VerificationError(
            f"component record count mismatch: quantities has {quantities_payload[2]} records, "
            f"prices has {prices_payload[2]} records"
        )

    q_records = parse_component_records(quantities_payload, component_kind=0)
    p_records = parse_component_records(prices_payload, component_kind=1)

    total = 0
    for i, ((q_id, q_val), (p_id, p_val)) in enumerate(zip(q_records, p_records)):
        if q_id != p_id:
            raise VerificationError(
                f"component item ID mismatch at index {i}: quantity item {q_id} != price item {p_id}"
            )

        product = q_val * p_val
        if product > U128_MAX:
            raise VerificationError(f"item product overflowed u128 at index {i}: {q_val} * {p_val}")

        total += product
        if total > U128_MAX:
            raise VerificationError(f"cumulative sum overflowed u128 at index {i}: total {total}")

    return total


def minimum_commitment(case_id: str | bytes | Sequence[int], threshold: int | str) -> bytes:
    """
    Compute domain-separated commitment for MinimumThreshold profile.
    Formula: SHA256(b"NOMOGENESIS/M3/MIN-SUM/V1\0" || case_id || u128_be(threshold))
    """
    cid = to_case_id_bytes(case_id)
    thresh = validate_u128(threshold, field_name="threshold", allow_zero=False)
    return sha256(MINIMUM_SUM_DOMAIN + cid + u128_be(thresh))


def exact_commitment(case_id: str | bytes | Sequence[int], result_payload: bytes) -> bytes:
    """
    Compute domain-separated commitment for ExactSum profile.
    Formula: SHA256(b"NOMOGENESIS/M3/EXACT-SUM/V1\0" || case_id || result_payload)
    """
    cid = to_case_id_bytes(case_id)
    return sha256(EXACT_SUM_DOMAIN + cid + result_payload)


def compute_worker_result_commitment(
    case_id: str | bytes | Sequence[int],
    job_id: int,
    total: int,
    threshold: int | str | None = None,
) -> bytes:
    """
    Compute worker result commitment for either MinimumThreshold or ExactSum profile.
    """
    cid = to_case_id_bytes(case_id)
    if threshold is not None:
        thresh_val = validate_u128(threshold, field_name="threshold", allow_zero=False)
        return minimum_commitment(cid, thresh_val)

    job_val = validate_u64(job_id, field_name="job_id")
    tot_val = validate_u128(total, field_name="total")
    result_payload = bytes([1, EXACT_SUM_PROFILE]) + u64_be(job_val) + u128_be(tot_val)
    return exact_commitment(cid, result_payload)

"""Economic buyer policy evaluation for Nomogenesis rescue coalitions."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from .exceptions import PolicyError, ValidationError
from .proof import UNIT, unit_to_yocto, validate_u128

BUYER_DECISION_DOMAIN: str = "NOMOGENESIS/R7-08B/BUYER-AGENT/V1"


@dataclass(frozen=True)
class PolicyVerdict:
    """Outcome of evaluating a proposed payment against buyer economic policy using exact integer accounting."""

    approved: bool
    reason: str
    capacity_yocto: int
    incremental_value_yocto: int
    payment_yocto: int
    surplus_yocto: int

    @property
    def capacity_units_exact(self) -> Decimal:
        """Exact authorized capacity in UNIT."""
        return Decimal(self.capacity_yocto) / Decimal(UNIT)

    @property
    def incremental_value_units_exact(self) -> Decimal:
        """Exact incremental value in UNIT."""
        return Decimal(self.incremental_value_yocto) / Decimal(UNIT)

    @property
    def payment_units_exact(self) -> Decimal:
        """Exact proposed payment in UNIT."""
        return Decimal(self.payment_yocto) / Decimal(UNIT)

    @property
    def surplus_units_exact(self) -> Decimal:
        """Exact net consumer surplus in UNIT."""
        return Decimal(self.surplus_yocto) / Decimal(UNIT)

    @property
    def capacity_units(self) -> float:
        """Floating point representation of capacity in UNIT for backward compatibility."""
        return float(self.capacity_units_exact)

    @property
    def incremental_value_units(self) -> float:
        """Floating point representation of incremental value in UNIT."""
        return float(self.incremental_value_units_exact)

    @property
    def payment_units(self) -> float:
        """Floating point representation of payment in UNIT."""
        return float(self.payment_units_exact)

    @property
    def surplus_units(self) -> float:
        """Floating point representation of surplus in UNIT."""
        return float(self.surplus_units_exact)

    def __str__(self) -> str:
        status = "APPROVED" if self.approved else "REJECTED"
        return (
            f"PolicyVerdict({status}: payment={self.payment_units_exact} UNIT, "
            f"cap={self.capacity_units_exact} UNIT, value_increment={self.incremental_value_units_exact} UNIT, "
            f"surplus={self.surplus_units_exact} UNIT; {self.reason})"
        )


@dataclass(frozen=True)
class BuyerPolicy:
    """
    Economic decision rules for a rescue mandate buyer.

    All internal arithmetic is conducted in exact integer yoctoNEAR.
    Floats, booleans, NaN, Infinity, negative values, and sub-yocto fractional amounts are rejected.

    Attributes:
        actor_id: Non-empty identifier for buyer actor (e.g. 'buyer-1')
        job_id: Non-negative designated rescue job identifier
        cap: Maximum authorized budget ceiling in UNIT (Decimal or canonical string)
        value: Gross economic value of completed task in UNIT
        outside_option: Value of best alternative action without rescue market in UNIT
        active: Whether buyer is participating in rescue procurement
        role: Actor role, defaults to 'buyer'
    """

    actor_id: str
    job_id: int
    cap: Decimal
    value: Decimal
    outside_option: Decimal = Decimal(0)
    active: bool = True
    role: str = "buyer"

    def __init__(
        self,
        actor_id: str,
        job_id: int,
        cap: int | str | Decimal,
        value: int | str | Decimal,
        outside_option: int | str | Decimal = Decimal(0),
        active: bool = True,
        role: str = "buyer",
    ) -> None:
        if isinstance(actor_id, bool) or not isinstance(actor_id, str) or not actor_id.strip():
            raise ValidationError(f"actor_id must be a non-empty string, got {actor_id!r}")

        if isinstance(job_id, bool) or not isinstance(job_id, int) or job_id < 0:
            raise ValidationError(f"job_id must be a non-negative integer, got {job_id!r}")

        if isinstance(active, bool) is False:
            raise ValidationError(f"active must be a boolean, got {active!r}")

        cap_yocto = unit_to_yocto(cap, "cap")
        value_yocto = unit_to_yocto(value, "value")
        outside_yocto = unit_to_yocto(outside_option, "outside_option")

        object.__setattr__(self, "actor_id", str(actor_id).strip())
        object.__setattr__(self, "job_id", int(job_id))
        object.__setattr__(self, "cap", Decimal(cap_yocto) / Decimal(UNIT))
        object.__setattr__(self, "value", Decimal(value_yocto) / Decimal(UNIT))
        object.__setattr__(self, "outside_option", Decimal(outside_yocto) / Decimal(UNIT))
        object.__setattr__(self, "active", bool(active))
        object.__setattr__(self, "role", str(role))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BuyerPolicy:
        """Create BuyerPolicy from a dictionary, converting numeric values safely without float truncation."""
        cap_raw = data["cap"]
        val_raw = data["value"]
        out_raw = data.get("outside_option", 0)

        # Disallow raw floats in dict unless passed as string or int
        if isinstance(cap_raw, float):
            raise ValidationError("Float cap rejected in buyer policy configuration; use Decimal, int, or string.")
        if isinstance(val_raw, float):
            raise ValidationError("Float value rejected in buyer policy configuration; use Decimal, int, or string.")
        if isinstance(out_raw, float):
            raise ValidationError("Float outside_option rejected in buyer policy configuration; use Decimal, int, or string.")

        return cls(
            actor_id=data.get("actor_id", f"buyer-{data.get('job_id', 0)}"),
            job_id=int(data.get("job_id", 0)),
            cap=cap_raw,
            value=val_raw,
            outside_option=out_raw,
            active=data.get("active", True),
            role=data.get("role", "buyer"),
        )

    @classmethod
    def from_json(cls, json_str: str) -> BuyerPolicy:
        """Deserialize BuyerPolicy from JSON string using parse_float=Decimal to prevent precision loss."""
        data = json.loads(json_str, parse_float=Decimal)
        return cls(
            actor_id=data.get("actor_id", f"buyer-{data.get('job_id', 0)}"),
            job_id=int(data.get("job_id", 0)),
            cap=data["cap"],
            value=data["value"],
            outside_option=data.get("outside_option", Decimal(0)),
            active=data.get("active", True),
            role=data.get("role", "buyer"),
        )

    @classmethod
    def from_file(cls, path: str | Path) -> BuyerPolicy:
        """Load BuyerPolicy from a JSON configuration file."""
        p = Path(path)
        return cls.from_json(p.read_text(encoding="utf-8"))

    @property
    def capacity_yocto(self) -> int:
        """Authorized budget ceiling in exact yoctoNEAR."""
        return unit_to_yocto(self.cap, "cap")

    @property
    def value_yocto(self) -> int:
        """Gross valuation in exact yoctoNEAR."""
        return unit_to_yocto(self.value, "value")

    @property
    def outside_option_yocto(self) -> int:
        """Outside option reservation value in exact yoctoNEAR."""
        return unit_to_yocto(self.outside_option, "outside_option")

    @property
    def incremental_value_yocto(self) -> int:
        """
        Net economic gain from recovery over the outside reservation in exact yoctoNEAR:
        max(0, value_yocto - outside_option_yocto).
        """
        return max(0, self.value_yocto - self.outside_option_yocto)

    def decide(self, payment: int | str | Decimal, in_units: bool = False) -> PolicyVerdict:
        """
        Evaluate proposed recovery payment against economic rationality conditions using exact integer arithmetic.

        Args:
            payment: Proposed payment amount (yoctoNEAR by default, or UNIT if in_units=True)
            in_units: If True, payment is interpreted as UNIT (10^21 yoctoNEAR)

        Returns:
            PolicyVerdict indicating approval and economic breakdown.
        """
        if isinstance(payment, bool):
            raise ValidationError("Payment cannot be a boolean")
        if isinstance(payment, float):
            raise ValidationError(
                "Float payment rejected to prevent precision loss. Use int, Decimal, or canonical decimal string."
            )

        if in_units:
            payment_yocto = unit_to_yocto(payment, "payment")
        else:
            payment_yocto = validate_u128(payment, "payment", allow_zero=True)

        cap_yocto = self.capacity_yocto
        inc_val_yocto = self.incremental_value_yocto
        surplus_yocto = inc_val_yocto - payment_yocto

        if not self.active:
            return PolicyVerdict(
                approved=False,
                reason="Buyer policy is inactive",
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                surplus_yocto=surplus_yocto,
            )

        if payment_yocto <= 0:
            return PolicyVerdict(
                approved=False,
                reason="Payment must be strictly positive",
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                surplus_yocto=surplus_yocto,
            )

        if payment_yocto > cap_yocto:
            pay_str = f"{Decimal(payment_yocto) / Decimal(UNIT):.4f}"
            cap_str = f"{Decimal(cap_yocto) / Decimal(UNIT):.4f}"
            return PolicyVerdict(
                approved=False,
                reason=f"Payment ({pay_str} UNIT) exceeds buyer authorized budget cap ({cap_str} UNIT)",
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                surplus_yocto=surplus_yocto,
            )

        if payment_yocto > inc_val_yocto:
            pay_str = f"{Decimal(payment_yocto) / Decimal(UNIT):.4f}"
            inc_str = f"{Decimal(inc_val_yocto) / Decimal(UNIT):.4f}"
            return PolicyVerdict(
                approved=False,
                reason=(
                    f"Payment ({pay_str} UNIT) exceeds incremental economic value "
                    f"({inc_str} UNIT; gross value={self.value}, outside option={self.outside_option})"
                ),
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                surplus_yocto=surplus_yocto,
            )

        return PolicyVerdict(
            approved=True,
            reason="Payment authorized under buyer economic rationality policy",
            capacity_yocto=cap_yocto,
            incremental_value_yocto=inc_val_yocto,
            payment_yocto=payment_yocto,
            surplus_yocto=surplus_yocto,
        )

    def validate(self, payment: int | str | Decimal, in_units: bool = False) -> PolicyVerdict:
        """
        Evaluate payment and raise PolicyError if rejected.
        """
        verdict = self.decide(payment=payment, in_units=in_units)
        if not verdict.approved:
            raise PolicyError(verdict.reason)
        return verdict

    def canonical_decision_payload(
        self, job_id: int, payment: int | str | Decimal, in_units: bool = False
    ) -> dict[str, Any]:
        """
        Build unsigned canonical decision specification matching Nomogenesis buyer agent protocol.

        Notice: This payload is an unsigned specification ready for signature by the external buyer
        signer process; it does not claim to be signed.
        """
        if isinstance(payment, (int, str)) and not in_units:
            payment_yocto = validate_u128(payment, "payment")
        else:
            verdict = self.decide(payment, in_units=in_units)
            payment_yocto = verdict.payment_yocto

        verdict = self.decide(payment_yocto, in_units=False)
        return {
            "domain": BUYER_DECISION_DOMAIN,
            "account_id": self.actor_id,
            "job_id": job_id,
            "exact_payment": str(payment_yocto),
            "capacity": str(self.capacity_yocto),
            "incremental_value": str(self.incremental_value_yocto),
            "approved": verdict.approved,
        }

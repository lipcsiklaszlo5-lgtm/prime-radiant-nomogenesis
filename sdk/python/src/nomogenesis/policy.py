"""Economic buyer policy evaluation for Nomogenesis rescue coalitions."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from .exceptions import PolicyError, ValidationError
from .proof import UNIT, validate_u128

BUYER_DECISION_DOMAIN: str = "NOMOGENESIS/R7-08B/BUYER-AGENT/V1"


@dataclass(frozen=True)
class PolicyVerdict:
    """Outcome of evaluating a proposed payment against buyer economic policy."""

    approved: bool
    reason: str
    capacity_yocto: int
    incremental_value_yocto: int
    payment_yocto: int
    capacity_units: float
    incremental_value_units: float
    payment_units: float
    surplus_yocto: int
    surplus_units: float

    def __str__(self) -> str:
        status = "APPROVED" if self.approved else "REJECTED"
        return (
            f"PolicyVerdict({status}: payment={self.payment_units} UNIT, "
            f"cap={self.capacity_units} UNIT, value_increment={self.incremental_value_units} UNIT, "
            f"surplus={self.surplus_units} UNIT; {self.reason})"
        )


@dataclass(frozen=True)
class BuyerPolicy:
    """
    Economic decision rules for a rescue mandate buyer.

    Attributes:
        actor_id: Identifier for buyer actor (e.g. 'buyer-1')
        job_id: Designated rescue job identifier
        cap: Maximum authorized payment budget in UNIT (1 UNIT = 10^21 yoctoNEAR)
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
        cap: int | float | str | Decimal,
        value: int | float | str | Decimal,
        outside_option: int | float | str | Decimal = Decimal(0),
        active: bool = True,
        role: str = "buyer",
    ) -> None:
        object.__setattr__(self, "actor_id", str(actor_id))
        object.__setattr__(self, "job_id", int(job_id))
        object.__setattr__(self, "cap", Decimal(str(cap)))
        object.__setattr__(self, "value", Decimal(str(value)))
        object.__setattr__(self, "outside_option", Decimal(str(outside_option)))
        object.__setattr__(self, "active", bool(active))
        object.__setattr__(self, "role", str(role))

        if self.cap < 0:
            raise ValidationError(f"cap cannot be negative, got {self.cap}")
        if self.value < 0:
            raise ValidationError(f"value cannot be negative, got {self.value}")
        if self.outside_option < 0:
            raise ValidationError(f"outside_option cannot be negative, got {self.outside_option}")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BuyerPolicy:
        """Create BuyerPolicy from a dictionary, e.g. loaded from policy JSON."""
        return cls(
            actor_id=data.get("actor_id", f"buyer-{data.get('job_id', 0)}"),
            job_id=int(data.get("job_id", 0)),
            cap=data["cap"],
            value=data["value"],
            outside_option=data.get("outside_option", 0),
            active=data.get("active", True),
            role=data.get("role", "buyer"),
        )

    @classmethod
    def from_json(cls, json_str: str) -> BuyerPolicy:
        """Deserialize BuyerPolicy from JSON string."""
        return cls.from_dict(json.loads(json_str))

    @classmethod
    def from_file(cls, path: str | Path) -> BuyerPolicy:
        """Load BuyerPolicy from a JSON configuration file."""
        p = Path(path)
        return cls.from_json(p.read_text(encoding="utf-8"))

    @property
    def capacity_yocto(self) -> int:
        """Authorized budget ceiling in yoctoNEAR."""
        return int(self.cap * Decimal(UNIT))

    @property
    def incremental_value_yocto(self) -> int:
        """
        Net economic gain from recovery over the outside alternative in yoctoNEAR:
        (value - outside_option) * UNIT.
        """
        increment = max(Decimal(0), self.value - self.outside_option)
        return int(increment * Decimal(UNIT))

    def decide(self, payment: int | str | float | Decimal, in_units: bool = False) -> PolicyVerdict:
        """
        Evaluate proposed recovery payment against economic rationality conditions.

        Args:
            payment: Proposed payment amount (yoctoNEAR by default, or UNIT if in_units=True)
            in_units: If True, payment is interpreted as UNIT (10^21 yoctoNEAR)

        Returns:
            PolicyVerdict indicating approval and economic breakdown.
        """
        if in_units:
            payment_dec = Decimal(str(payment))
            payment_yocto = int(payment_dec * Decimal(UNIT))
        else:
            if isinstance(payment, (int, str)):
                payment_yocto = validate_u128(payment, field_name="payment")
            else:
                payment_yocto = int(Decimal(str(payment)))

        cap_yocto = self.capacity_yocto
        inc_val_yocto = self.incremental_value_yocto

        cap_units = float(self.cap)
        inc_val_units = float(max(Decimal(0), self.value - self.outside_option))
        pay_units = payment_yocto / UNIT
        surplus_yocto = inc_val_yocto - payment_yocto
        surplus_units = surplus_yocto / UNIT

        if not self.active:
            return PolicyVerdict(
                approved=False,
                reason="Buyer policy is inactive",
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                capacity_units=cap_units,
                incremental_value_units=inc_val_units,
                payment_units=pay_units,
                surplus_yocto=surplus_yocto,
                surplus_units=surplus_units,
            )

        if payment_yocto <= 0:
            return PolicyVerdict(
                approved=False,
                reason="Payment must be strictly positive",
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                capacity_units=cap_units,
                incremental_value_units=inc_val_units,
                payment_units=pay_units,
                surplus_yocto=surplus_yocto,
                surplus_units=surplus_units,
            )

        if payment_yocto > cap_yocto:
            return PolicyVerdict(
                approved=False,
                reason=(
                    f"Payment ({pay_units:.4f} UNIT) exceeds buyer authorized budget cap "
                    f"({cap_units:.4f} UNIT)"
                ),
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                capacity_units=cap_units,
                incremental_value_units=inc_val_units,
                payment_units=pay_units,
                surplus_yocto=surplus_yocto,
                surplus_units=surplus_units,
            )

        if payment_yocto > inc_val_yocto:
            return PolicyVerdict(
                approved=False,
                reason=(
                    f"Payment ({pay_units:.4f} UNIT) exceeds incremental economic value "
                    f"({inc_val_units:.4f} UNIT; gross value={self.value}, outside option={self.outside_option})"
                ),
                capacity_yocto=cap_yocto,
                incremental_value_yocto=inc_val_yocto,
                payment_yocto=payment_yocto,
                capacity_units=cap_units,
                incremental_value_units=inc_val_units,
                payment_units=pay_units,
                surplus_yocto=surplus_yocto,
                surplus_units=surplus_units,
            )

        return PolicyVerdict(
            approved=True,
            reason="Payment authorized under buyer economic rationality policy",
            capacity_yocto=cap_yocto,
            incremental_value_yocto=inc_val_yocto,
            payment_yocto=payment_yocto,
            capacity_units=cap_units,
            incremental_value_units=inc_val_units,
            payment_units=pay_units,
            surplus_yocto=surplus_yocto,
            surplus_units=surplus_units,
        )

    def validate(self, payment: int | str | float | Decimal, in_units: bool = False) -> PolicyVerdict:
        """
        Evaluate payment and raise PolicyError if rejected.
        """
        verdict = self.decide(payment=payment, in_units=in_units)
        if not verdict.approved:
            raise PolicyError(verdict.reason)
        return verdict

    def canonical_decision_payload(self, job_id: int, payment_yocto: int) -> dict[str, Any]:
        """
        Build canonical signed-decision dictionary matching Nomogenesis buyer agent protocol.
        """
        verdict = self.decide(payment_yocto)
        return {
            "domain": BUYER_DECISION_DOMAIN,
            "account_id": self.actor_id,
            "job_id": job_id,
            "exact_payment": str(payment_yocto),
            "capacity": str(self.capacity_yocto),
            "incremental_value": str(self.incremental_value_yocto),
            "approved": verdict.approved,
        }

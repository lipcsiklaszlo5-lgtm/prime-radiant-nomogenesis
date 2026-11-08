#!/usr/bin/env python3
import json
import sys
from pathlib import Path

sys.path.insert(0, str(
    Path(__file__).resolve().parents[1] / "src"
))

from nomogenesis import BuyerPolicy

assert len(sys.argv) == 2
request = json.loads(sys.argv[1])
p = request["policy"]

policy = BuyerPolicy(
    actor_id=p["actor_id"],
    job_id=p["job_id"],
    cap=str(p["cap"]),
    value=str(p["value"]),
    outside_option=str(p["outside_option"]),
    active=p["active"],
)

verdict = policy.decide(request["payment_yocto"])
print(json.dumps({
    "approved": verdict.approved,
    "payment_yocto": str(verdict.payment_yocto),
    "capacity_yocto": str(verdict.capacity_yocto),
    "incremental_value_yocto": str(
        verdict.incremental_value_yocto
    ),
}))

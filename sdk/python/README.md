# Nomogenesis Shield Python SDK

The SDK is a Python 3.10+ standard-library package for read-only NEAR case
audits, component Merkle verification, exact integer accounting, and buyer
policy evaluation. It does not hold keys or sign transactions. Its package
metadata is in `pyproject.toml` and its implementation is in `src/nomogenesis/`.

From the repository root:

```bash
python3 -m pip install ./sdk/python
```

The simplest end-to-end check is the repository's `npm ci` followed by
`npm run verify`: it starts a fresh local NEAR Sandbox and calls the Python
SDK to audit the completed case. It needs no public NEAR account.

For a read-only public Testnet query in an environment with working RPC:

```python
from nomogenesis import Shield

shield = Shield(
    network="testnet",
    contract_id="nmg-r7v2-0b9a0eff20.testnet",
)
report = shield.audit_case(
    case_id="5b8530acbd28c3e39a90259e41e50c19fc1792798ab9522249fb0b9d7ac6f815"
)
print(report)
```

The immutable 19-transaction public record and its saved SDK result are in
`../../docs/evidence/technical-closure-testnet-2026-11-12/`. Run
`npm run verify:evidence` from the repository root to check consistency of
the recorded receipts without contacting an RPC.

Claimable balances are global contract values and change as other cases
settle. Do not hardcode an old expected claimable total when auditing a
historical case. Merkle verification checks payloads against commitments
reported by the queried chain state; a JSON-RPC response is not a locally
verified PoS state proof. It also cannot establish that an arbitrary
physical or off-chain repair succeeded. There has been no independent
security audit.

SDK tests: `python3 -m unittest discover -s sdk/python/tests -v` from the
repository root with the package installed or `PYTHONPATH=sdk/python/src`.
Earlier documentation and examples are archived at
`../../docs/archive/SDK-README-legacy-2026-11.md`.

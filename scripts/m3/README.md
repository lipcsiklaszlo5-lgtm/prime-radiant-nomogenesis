# M3 script directory

For a fresh, complete reviewer run use `npm run verify` from the repository
root. The entry point is `technical_closure.cjs --sandbox`; it invokes the
current coordinator, separate agents and Python SDK audit. The Testnet
`--live` mode is not part of reviewer reproduction.

The `m3_r2*` and `m3_r3*` Python files are historical development generators.
The numbered `r7_13v_run*` launchers and recovery files document previous
experiments. They are not alternate quickstarts. Some older-named modules
are still imported by the active lifecycle, so filename age alone is not
evidence that a file can be deleted. See `../../docs/REPOSITORY_MAP.md`.

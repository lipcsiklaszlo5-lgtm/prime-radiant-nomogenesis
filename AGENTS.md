# Reviewer and contributor entry point

This repository's current submission is described by `README.md` and
`HACKATHON.md`. The earlier `docs/` worklogs are historical. In particular,
do not treat their older “V2 Testnet not verified” statements as current.

1. Read `README.md`.
2. Run `npm ci` and `npm run verify` on Linux x86-64 with Node 22 and Python 3.
3. Run `npm run verify:evidence` to check the recorded public Testnet artifacts.
4. Report the observed command output and exit code. Do not infer PASS from
   documentation alone.

`npm run verify` uses a fresh local NEAR Sandbox and the committed exact V2
WASM. It must not require the EC2 host's home directory, `NODE_PATH`, Testnet
accounts, credentials or additional checkout paths. Never invoke `--live`
or any historical numbered launcher during review.

The core that completed the public lifecycle is frozen at commit
`b98f389dd12c5bf2819c317082ac21f5256189c9`, tag
`technical-closure-testnet-2026-11-12`. Submission documentation and
packaging live on `submission/hackathon-final`. Keep claims scoped to the
actual sandbox and Testnet evidence; there is no independent oracle or
security audit. Prior contributor guidance is archived at
`docs/archive/AGENTS-legacy-2026-11.md`.

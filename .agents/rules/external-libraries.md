# External Libraries

- Distrust your built in knowledge for external libraries, frameworks, and tools.
- Before using a third party API, check the source code in `~/src/oss/<library>` first.
- If `~/src/oss/<library>` does not exist, shallow clone the library there with `git clone --depth 1`.
- Prefer library source and tests over docs. Use docs only when source and tests are not enough.
- Verify the exact API shape you plan to use. Check signatures, parameter types, return types, setup patterns, and test usage.
- Use `node_modules` only as a fallback when you cannot get the source under `~/src/oss/`.

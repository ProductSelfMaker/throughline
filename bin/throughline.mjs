#!/usr/bin/env node
// CLI entry: load the bundled server directly (same process). process.argv passes
// through, so `throughline <project-dir>` reaches server.ts as process.argv[2], and
// the server's own SIGINT/SIGTERM handlers manage shutdown.
import './../dist-server/server.mjs';

#!/usr/bin/env node

import { ProductionAppConfigurationError, readProductionAppConfig } from "./production-app-config.mjs";

try {
  readProductionAppConfig();
  console.log("Production application configuration is valid (environment only; VPS reachability and live Supabase checks are separate).");
} catch (error) {
  console.error("Production application configuration is invalid:");
  console.error(error instanceof ProductionAppConfigurationError ? error.message : "Configuration could not be read; details withheld.");
  process.exitCode = 1;
}

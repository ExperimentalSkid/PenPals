#!/usr/bin/env node

import { EmailConfigurationError, readProductionEmailConfig } from "./production-email-config.mjs";

try {
  readProductionEmailConfig();
  console.log("Production email-verification configuration is valid (environment only; hosted configuration and delivery are separate checks).");
} catch (error) {
  console.error("Production email-verification configuration is invalid:");
  console.error(error instanceof EmailConfigurationError ? error.message : "Configuration could not be read; details withheld.");
  process.exitCode = 1;
}

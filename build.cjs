const { execSync } = require("node:child_process");

execSync("npm run build", {
  stdio: "inherit",
  env: process.env
});

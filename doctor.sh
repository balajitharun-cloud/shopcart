#!/usr/bin/env bash
# ShopCart backend doctor.
# Checks the toolchain, the port and the build, then starts the API.
#   bash doctor.sh          # diagnose + run on port 8080
#   PORT=8090 bash doctor.sh
set -u

ok()   { printf '  [ok]   %s\n' "$*"; }
bad()  { printf '  [FAIL] %s\n' "$*"; FAILED=1; }
info() { printf '  [info] %s\n' "$*"; }

FAILED=0
PORT="${PORT:-8080}"

echo "ShopCart doctor"
echo "---------------"

# 1. Are we in the right folder?
if [ -f pom.xml ]; then
  ok "pom.xml found in $(pwd)"
else
  bad "pom.xml not found. Run this from the repository root: cd shopcart && bash doctor.sh"
  echo
  echo "Verdict: wrong directory - nothing else can work from here."
  exit 1
fi

# 2. Java
if command -v java >/dev/null 2>&1; then
  JAVA_LINE="$(java -version 2>&1 | head -1)"
  JAVA_MAJOR="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
  if [ "${JAVA_MAJOR:-0}" -ge 17 ] 2>/dev/null; then
    ok "Java ${JAVA_MAJOR} - ${JAVA_LINE}"
  else
    bad "Java ${JAVA_MAJOR:-unknown} found, but 17 or newer is required - ${JAVA_LINE}"
  fi
else
  bad "java not found on PATH. Install JDK 17+ (Codespaces: rebuild the container, it uses .devcontainer/devcontainer.json)"
fi

# 3. Maven
if command -v mvn >/dev/null 2>&1; then
  ok "$(mvn -v 2>/dev/null | head -1)"
else
  bad "mvn not found on PATH. Install Maven 3.9+, or use the devcontainer image which ships both"
fi

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "Verdict: the toolchain is incomplete - fix the [FAIL] lines above and run this again."
  exit 1
fi

# 4. Is the port free - or is ShopCart already running on it?
if (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  exec 3>&- 2>/dev/null
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/config" 2>/dev/null | grep -q 'taxRate'; then
    ok "ShopCart is ALREADY running at http://localhost:${PORT}"
    echo
    echo "Verdict: nothing to start. Open http://localhost:${PORT} in your browser."
    echo "         To restart it, stop the other process first - see README > Troubleshooting."
    exit 0
  fi
  echo
  bad "port ${PORT} is held by another program (not ShopCart)."
  echo
  echo "Verdict: free the port, or run on a different one:  PORT=8090 bash doctor.sh"
  echo "  find it:  lsof -i :${PORT}     (macOS/Linux)   |   netstat -ano | findstr :${PORT}   (Windows)"
  exit 1
else
  ok "port ${PORT} is free"
fi

# 4b. Is another run holding the database file?
if [ -f "data/shopcart.mv.db" ] && [ -f "data/shopcart.lock.db" ]; then
  info "data/shopcart.lock.db exists - a previous run may still be alive."
  info "If startup fails with 'Database may be already in use', stop that process first."
fi

# 5. Build
echo
echo "Building (this takes ~40s the first time)..."
if mvn -B -q -DskipTests package > /tmp/shopcart-build.log 2>&1; then
  ok "build succeeded"
else
  bad "build failed - last 25 lines of /tmp/shopcart-build.log:"
  tail -25 /tmp/shopcart-build.log | sed 's/^/         /'
  echo
  echo "Verdict: the build is broken. Send the lines above."
  exit 1
fi

JAR="$(ls -1t target/shopcart-*.jar 2>/dev/null | grep -v original | head -1)"
if [ -z "$JAR" ]; then
  bad "no jar in target/ after a successful build"
  exit 1
fi
ok "jar: ${JAR}"

# 6. Start it
echo
echo "Starting the API on http://localhost:${PORT}  (Ctrl+C to stop)"
echo "When you see 'Started ShopcartApplication', open http://localhost:${PORT} in a browser."
echo "Health check: http://localhost:${PORT}/api/config"
echo
exec java -jar "$JAR" --server.port="${PORT}"

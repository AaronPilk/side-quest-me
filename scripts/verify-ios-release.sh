#!/bin/sh
set -eu
bundle=${1:?Pass the bundled public directory}
manifest="$bundle/native-build.json"
if [ ! -f "$manifest" ]; then
  echo "error: Missing iOS build metadata. Run npm run ios:sync before archiving." >&2
  exit 1
fi
# Xcode supplies /usr/bin/python3, including when its GUI has no Node in PATH.
# Mirror ios-release-config.mjs with a real URL/IP parser; the tests run both
# entry points against the same temporary manifests on macOS.
/usr/bin/python3 - "$manifest" <<'PY'
import datetime
import ipaddress
import json
import re
import sys
import urllib.parse

def fail(message):
    print("error: " + message, file=sys.stderr)
    sys.exit(1)

def production_origin(value, label):
    message = label + " must be an exact public HTTPS origin"
    if not isinstance(value, str) or not re.fullmatch(r"[\x21-\x7e]+", value) or re.search(r"[\\%?#@]", value):
        fail(message)
    try:
        url = urllib.parse.urlsplit(value)
        host = url.hostname
        port = url.port
        if url.scheme != "https" or not host or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
            fail(message)
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address:
            # Match the canonical origin accepted by the JS URL parser.
            authority = "[" + str(address) + "]" if address.version == 6 else str(address)
        else:
            # JS parses a numeric final label as IPv4. Reject aliases rather
            # than treating 127.1 / decimal / hexadecimal IPs as DNS names.
            if re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", host.rstrip(".").rsplit(".", 1)[-1], re.I):
                fail(message)
            authority = host
        if port is not None and port != 443:
            authority += ":" + str(port)
        origin = "https://" + authority
        if value not in (origin, origin + "/"):
            fail(message)
        dns_host = host.rstrip(".")
        if dns_host == "localhost" or dns_host.endswith(".localhost"):
            fail(message)
        if address:
            mapped = address.ipv4_mapped if address.version == 6 else None
            if address.is_loopback or address.is_unspecified or (mapped and (mapped.is_loopback or mapped.is_unspecified)):
                fail(message)
    except (ValueError, TypeError):
        fail(message)

try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        record = json.load(stream)
except (OSError, ValueError):
    fail("Missing or invalid iOS build metadata. Run npm run ios:sync before archiving.")
if not isinstance(record, dict) or record.get("platform") != "ios" or record.get("environment") != "production":
    fail("App Store/Release builds require production iOS assets. Run npm run ios:sync, not ios:sync:demo.")
built_at = record.get("builtAt")
if not isinstance(built_at, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", built_at):
    fail("Production iOS assets need a valid build timestamp.")
try:
    datetime.datetime.strptime(built_at, "%Y-%m-%dT%H:%M:%S.%fZ")
except ValueError:
    fail("Production iOS assets need a valid build timestamp.")
for field in ("apiOrigin", "publicOrigin"):
    production_origin(record.get(field), field)
print("Sidequest production iOS assets verified.")
PY

#!/usr/bin/env python3
"""
rf_transmit_e32.py – Transmit an RF payload via an EBYTE E32 LoRa UART module.

Called by the Node.js rfService when RF_DRIVER=e32 is set.

Usage:
    python3 rf_transmit_e32.py --payload '<json>'

JSON payload fields:
  code        str/list  RF code (binary string, hex string, or int-list)
  repeat      int       Number of transmissions                (default 3)
  port        str       Serial port                            (default /dev/ttyS0)
  baud        int       UART baud rate                         (default 9600)
  m0Pin       int       BCM GPIO pin wired to E32 M0           (default 17)
  m1Pin       int       BCM GPIO pin wired to E32 M1           (default 27)
  auxPin      int|null  BCM GPIO pin wired to E32 AUX          (optional)

──────────────────────────────────────────────────────────────────────────────
Code formats
──────────────────────────────────────────────────────────────────────────────

1.  Binary string  "10110011..."
    Zero-padded to a full byte boundary and packed MSB-first.

2.  Hex string     "0xB3..." or "B3..."
    Decoded directly to bytes.

3.  Int list       [0xB3, 0x4A, ...]
    Each element treated as one byte.
"""

import sys
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def parse_args():
    p = argparse.ArgumentParser(
        description="Transmit RF payload via EBYTE E32 LoRa UART"
    )
    p.add_argument("--payload", required=True, help="JSON payload string")
    return p.parse_args()


def code_to_bytes(code) -> bytes:
    """
    Convert *code* to a bytes object for UART transmission.

    Accepted formats:
      - list of ints  → each int is one byte
      - hex string    → decoded as raw bytes ("0xB3A4..." or "B3A4...")
      - binary string → packed MSB-first, zero-padded to the next byte boundary
    """
    if isinstance(code, list):
        return bytes(code)

    code = str(code).strip()

    # Explicit hex prefix
    if code.lower().startswith("0x"):
        hex_str = code[2:]
        if len(hex_str) % 2:
            hex_str = "0" + hex_str
        return bytes.fromhex(hex_str)

    # Pure binary string (only 0 and 1)
    if code and all(c in "01" for c in code):
        padded = code.ljust((len(code) + 7) // 8 * 8, "0")
        result = bytearray()
        for i in range(0, len(padded), 8):
            result.append(int(padded[i : i + 8], 2))
        return bytes(result)

    # Try hex without prefix (must have even length and valid hex chars)
    if len(code) % 2 == 0 and all(c in "0123456789abcdefABCDEF" for c in code):
        try:
            return bytes.fromhex(code)
        except ValueError:
            pass

    # Fallback: UTF-8 encode
    return code.encode("utf-8")


def transmit(payload):
    """Main transmit routine."""
    try:
        from e32 import E32
    except ImportError as exc:
        log.error(
            "Could not import e32 module.  Make sure pyserial and RPi.GPIO "
            "are installed and you are running on a Raspberry Pi.\n"
            f"  {exc}"
        )
        sys.exit(1)

    code    = payload.get("code", "")
    repeat  = int(payload.get("repeat", 3))
    port    = payload.get("port",  "/dev/ttyS0")
    baud    = int(payload.get("baud",  9600))
    m0_pin  = int(payload.get("m0Pin", 17))
    m1_pin  = int(payload.get("m1Pin", 27))
    aux_raw = payload.get("auxPin", None)
    aux_pin = int(aux_raw) if aux_raw is not None else None

    if not code:
        log.error("No code provided in payload")
        sys.exit(1)

    data = code_to_bytes(code)
    log.info(
        f"TX port={port}  repeat={repeat}  "
        f"payload={len(data)} byte(s): {data.hex()}"
    )

    import time
    radio = E32(port=port, baud=baud, m0_pin=m0_pin, m1_pin=m1_pin, aux_pin=aux_pin)
    try:
        radio.open()
        for i in range(repeat):
            radio.transmit(data)
            if i < repeat - 1:
                time.sleep(0.1)
        log.info("Transmission complete")
    finally:
        radio.close()


def main():
    args = parse_args()
    try:
        payload = json.loads(args.payload)
    except json.JSONDecodeError as exc:
        log.error(f"Invalid JSON payload: {exc}")
        sys.exit(1)

    transmit(payload)


if __name__ == "__main__":
    main()

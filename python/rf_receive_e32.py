#!/usr/bin/env python3
"""
rf_receive_e32.py – Receive an RF payload via an EBYTE E32 LoRa UART module.

Called by the Node.js rfService when the /api/blinds/learn endpoint is hit
and RF_DRIVER=e32 is set.  Listens for an incoming LoRa packet, converts the
received bytes to a binary string, and **prints the result to stdout** so that
the calling Node process can read it.

Usage:
    python3 rf_receive_e32.py \\
        --timeout   10          \\
        --port      /dev/ttyS0  \\
        --baud      9600        \\
        --m0-pin    17          \\
        --m1-pin    27          \\
        [--aux-pin  22]

Exit codes:
    0  – data was received (printed on stdout as a binary string)
    1  – timeout or hardware error
"""

import sys
import argparse
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)


def parse_args():
    p = argparse.ArgumentParser(
        description="Receive RF payload via EBYTE E32 LoRa UART"
    )
    p.add_argument("--timeout",  type=float, default=10.0,
                   help="Receive window in seconds (default 10)")
    p.add_argument("--port",     default="/dev/ttyS0",
                   help="Serial port (default /dev/ttyS0)")
    p.add_argument("--baud",     type=int, default=9600,
                   help="UART baud rate (default 9600)")
    p.add_argument("--m0-pin",   type=int, default=17, dest="m0_pin",
                   help="BCM GPIO pin wired to E32 M0 (default 17)")
    p.add_argument("--m1-pin",   type=int, default=27, dest="m1_pin",
                   help="BCM GPIO pin wired to E32 M1 (default 27)")
    p.add_argument("--aux-pin",  type=int, default=None, dest="aux_pin",
                   help="BCM GPIO pin wired to E32 AUX (optional)")
    return p.parse_args()


def bytes_to_binary(data: bytes) -> str:
    """Convert bytes to a binary string (MSB-first per byte)."""
    return "".join(format(b, "08b") for b in data)


def main():
    args = parse_args()

    try:
        from e32 import E32
    except ImportError as exc:
        log.error(
            "Could not import e32 module.  Ensure pyserial and RPi.GPIO are "
            f"installed and you are running on a Raspberry Pi.\n  {exc}"
        )
        sys.exit(1)

    radio = E32(
        port=args.port,
        baud=args.baud,
        m0_pin=args.m0_pin,
        m1_pin=args.m1_pin,
        aux_pin=args.aux_pin,
    )
    try:
        radio.open()
        log.info(
            f"Listening for LoRa packet on {args.port} "
            f"(timeout={args.timeout}s)…"
        )
        data = radio.receive(timeout_sec=args.timeout)
    finally:
        radio.close()

    if not data:
        log.error("No data received within the timeout window")
        sys.exit(1)

    code = bytes_to_binary(data)
    log.info(f"Received {len(data)} byte(s): {data.hex()} → code: {code}")

    # Print binary string to stdout for the Node process to read
    print(code)
    sys.exit(0)


if __name__ == "__main__":
    main()

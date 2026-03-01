#!/usr/bin/env python3
"""
rf_transmit.py – Transmit an OOK RF code via the SX1278.

Called by the Node.js rfService with a JSON payload:

    python3 rf_transmit.py --payload '<json>'

JSON payload fields:
  frequency   int    Carrier frequency in Hz          (default 433_920_000)
  code        str    RF code – see "Code formats" below
  protocol    dict   Timing parameters (see Protocol section)
  repeat      int    Number of times to repeat the frame (default 3)
  spiBus      int    SPI bus number                    (default 0)
  spiDevice   int    SPI chip-select number            (default 0)
  resetPin    int    BCM GPIO pin wired to SX1278 RESET (default 22)

──────────────────────────────────────────────────────────────────────────────
Code formats
──────────────────────────────────────────────────────────────────────────────

1.  Binary string  "10110011..."
    Each character is one bit.  Pulse widths come from `protocol`.

2.  Hex string     "0xB3..." or "B3..."
    Converted to a binary string.

3.  Timing array   [350, 1050, 1050, 350, ...]
    Raw alternating ON/OFF pulse widths in µs passed to the SX1278 directly.

──────────────────────────────────────────────────────────────────────────────
Protocol object (used for binary/hex codes)
──────────────────────────────────────────────────────────────────────────────
  pulseLength       int   Base pulse length in µs        (default 350)
  syncFactor.high   int   Sync pulse ON  multiplier      (default 1)
  syncFactor.low    int   Sync pulse OFF multiplier      (default 31)
  zero.high         int   Logic 0 ON  multiplier         (default 1)
  zero.low          int   Logic 0 OFF multiplier         (default 3)
  one.high          int   Logic 1 ON  multiplier         (default 3)
  one.low           int   Logic 1 OFF multiplier         (default 1)
  invertedSignal    bool  Swap ON↔OFF for inverted wiring (default false)

These defaults match the widely-used "Protocol 1" found in many 433 MHz
OOK remotes and are a reasonable starting point for AC123-16D remotes.
Capture the actual timings from your remote (see rf_receive.py) and adjust.
"""

import sys
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def parse_args():
    p = argparse.ArgumentParser(description="Transmit an OOK RF code via SX1278")
    p.add_argument("--payload", required=True, help="JSON payload string")
    return p.parse_args()


def hex_to_bin(hex_str):
    """Convert a hex string (with or without leading 0x) to a binary string."""
    hex_str = hex_str.lstrip("0x").lstrip("0X")
    value = int(hex_str, 16)
    bit_len = len(hex_str) * 4
    return format(value, f"0{bit_len}b")


def build_timings(code, protocol):
    """
    Convert a code string (binary or hex) to a flat list of ON/OFF timings
    in microseconds, prepending one sync pulse.

    Returns: list[int]  – alternating ON, OFF durations in µs
    """
    pl        = protocol.get("pulseLength", 350)
    sync_high = protocol.get("syncFactor", {}).get("high", 1)
    sync_low  = protocol.get("syncFactor", {}).get("low",  31)
    zero_high = protocol.get("zero",       {}).get("high", 1)
    zero_low  = protocol.get("zero",       {}).get("low",  3)
    one_high  = protocol.get("one",        {}).get("high", 3)
    one_low   = protocol.get("one",        {}).get("low",  1)
    inverted  = protocol.get("invertedSignal", False)

    # Normalise code to a binary string
    if isinstance(code, list):
        # Already a raw timing array – return as-is
        return code

    code = str(code).strip()
    if code.lower().startswith("0x") or all(c in "0123456789abcdefABCDEF" for c in code):
        try:
            code = hex_to_bin(code)
        except ValueError:
            pass  # treat as binary string

    timings = []

    def add(high_us, low_us):
        if inverted:
            timings.extend([low_us, high_us])
        else:
            timings.extend([high_us, low_us])

    # Sync pulse
    add(sync_high * pl, sync_low * pl)

    # Data bits
    for bit in code:
        if bit == "1":
            add(one_high * pl, one_low * pl)
        else:
            add(zero_high * pl, zero_low * pl)

    return timings


def transmit(payload):
    """Main transmit routine.  Imports hardware libs only when running."""
    try:
        from sx1278 import SX1278
    except ImportError as exc:
        log.error(
            "Could not import sx1278 module.  Make sure spidev and RPi.GPIO "
            "are installed and you are running on a Raspberry Pi.\n"
            f"  {exc}"
        )
        sys.exit(1)

    freq      = payload.get("frequency",  433_920_000)
    code      = payload.get("code",       "")
    protocol  = payload.get("protocol",   {})
    repeat    = int(payload.get("repeat", 3))
    spi_bus   = int(payload.get("spiBus",   0))
    spi_dev   = int(payload.get("spiDevice", 0))
    reset_pin = int(payload.get("resetPin", 22))

    if not code:
        log.error("No code provided in payload")
        sys.exit(1)

    # Build timing list
    if isinstance(code, list):
        timings = code
    else:
        timings = build_timings(code, protocol)

    log.info(
        f"TX freq={freq/1e6:.2f} MHz  repeat={repeat}  "
        f"timings={len(timings)//2} pulses"
    )

    radio = SX1278(spi_bus=spi_bus, spi_device=spi_dev, reset_pin=reset_pin)
    try:
        radio.open()
        radio.configure_ook(freq_hz=freq)
        radio.transmit_timings(timings, repeat=repeat)
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

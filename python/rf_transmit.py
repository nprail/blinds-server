#!/usr/bin/env python3
"""
rf_transmit.py – Transmit an OOK RF code via an FS1000A 433 MHz transmitter.

The FS1000A DATA pin is wired to a Raspberry Pi GPIO output.  Pulling DATA
HIGH turns the 433.92 MHz carrier on; pulling it LOW turns it off.  This
produces the OOK pulse waveform used by AC123-16D-style blind remotes.

Called by the Node.js rfService with a JSON payload:

    python3 rf_transmit.py --payload '<json>'

JSON payload fields:
  code        str/list  RF code – see "Code formats" below
  protocol    dict      Timing parameters (see Protocol section)
  repeat      int       Number of times to repeat the frame (default 3)
  txPin       int       BCM GPIO pin wired to FS1000A DATA    (default 17)

──────────────────────────────────────────────────────────────────────────────
Code formats
──────────────────────────────────────────────────────────────────────────────

1.  Binary string  "10110011..."
    Each character is one bit.  Pulse widths come from `protocol`.

2.  Hex string     "0xB3..." or "B3..."
    Converted to a binary string, then treated as (1) above.

3.  Timing array   [350, 1050, 1050, 350, ...]
    Raw alternating ON/OFF pulse widths in µs, passed directly to the GPIO.

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
"""

import sys
import json
import argparse
import logging
import time

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def parse_args():
    p = argparse.ArgumentParser(
        description="Transmit an OOK RF code via FS1000A GPIO"
    )
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

    Binary strings (only '0' and '1' characters) are used as-is.
    Hex strings (explicit '0x' prefix or containing non-binary hex digits
    [2-9a-fA-F]) are converted to binary first.

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

    # Already a raw timing array
    if isinstance(code, list):
        return code

    code = str(code).strip()

    # Detect binary string first — only '0' and '1', and non-empty
    is_binary = bool(code) and all(c in "01" for c in code) and not code.lower().startswith("0x")

    if not is_binary:
        # Explicit hex prefix OR contains non-binary hex digits → decode as hex
        if code.lower().startswith("0x") or any(
            c in "23456789abcdefABCDEF" for c in code
        ):
            try:
                code = hex_to_bin(code)
            except ValueError:
                pass  # fall through and treat as binary

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


def _busy_wait_us(duration_us):
    """Busy-wait for *duration_us* microseconds using monotonic clock."""
    end = time.monotonic() + duration_us * 1e-6
    while time.monotonic() < end:
        pass


def transmit(payload):
    """Main transmit routine.  Imports RPi.GPIO only when running."""
    try:
        import RPi.GPIO as GPIO
    except ImportError as exc:
        log.error(
            "Could not import RPi.GPIO.  Make sure it is installed and you are "
            f"running on a Raspberry Pi.\n  {exc}"
        )
        sys.exit(1)

    code     = payload.get("code",    "")
    protocol = payload.get("protocol", {})
    repeat   = int(payload.get("repeat", 3))
    tx_pin   = int(payload.get("txPin",  17))

    if not code:
        log.error("No code provided in payload")
        sys.exit(1)

    timings = build_timings(code, protocol)

    log.info(
        f"TX pin={tx_pin}  repeat={repeat}  "
        f"timings={len(timings)//2} pulse pairs"
    )

    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(tx_pin, GPIO.OUT, initial=GPIO.LOW)

    try:
        for _ in range(repeat):
            pairs = list(zip(timings[0::2], timings[1::2]))
            for on_us, off_us in pairs:
                GPIO.output(tx_pin, GPIO.HIGH)
                _busy_wait_us(on_us)
                GPIO.output(tx_pin, GPIO.LOW)
                _busy_wait_us(off_us)
            # Inter-frame gap
            time.sleep(0.010)

        log.info("Transmission complete")
    finally:
        GPIO.output(tx_pin, GPIO.LOW)
        GPIO.cleanup()


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

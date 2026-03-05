#!/usr/bin/env python3
"""
rf_receive.py – Capture an OOK RF code via an RXB6 433 MHz receiver.

The RXB6 DATA pin goes HIGH when a 433.92 MHz carrier is detected and LOW
when it is absent.  This script polls that GPIO pin, records the timing of
HIGH/LOW transitions, converts them to a binary string, and **prints the
result to stdout** so the calling Node process can read it.

Called by the Node.js rfService when the /api/blinds/learn endpoint is hit.

Usage:
    python3 rf_receive.py \\
        --timeout   10     \\   # seconds to wait for a signal
        --rx-pin    27         # BCM GPIO pin wired to RXB6 DATA

Exit codes:
    0  – a code was captured (printed on stdout) OR timeout with no signal
         (empty stdout — callers should treat empty stdout as a timeout/408)
    1  – hardware or argument error
"""

import sys
import time
import argparse
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)

# Minimum ON-pulse duration we consider a real signal, not noise (µs)
MIN_BURST_US   = 200
# Minimum number of timing edges to consider a complete frame
MIN_EDGE_COUNT = 8
# GPIO polling interval in seconds.  50 µs provides a reasonable balance
# between timing resolution and CPU usage.  Note: Python on a non-realtime
# Linux kernel cannot guarantee precise timing; capture accuracy improves
# when system load is low (e.g. no heavy background tasks during learning).
POLL_INTERVAL  = 0.000050   # 50 µs


def parse_args():
    p = argparse.ArgumentParser(
        description="Capture an OOK RF code via RXB6 GPIO"
    )
    p.add_argument("--timeout", type=float, default=10.0,
                   help="Capture window in seconds (default 10)")
    p.add_argument("--rx-pin",  type=int,   default=27,   dest="rx_pin",
                   help="BCM GPIO pin wired to RXB6 DATA (default 27)")
    return p.parse_args()


def timings_to_binary(timings, pulse_length=None):
    """
    Convert a flat list of ON/OFF durations (µs) to a binary string.

    The shortest ON pulse is used as the base pulse length.  Pulses shorter
    than 2× the base are '1'; longer pulses are '0'.
    """
    if not timings:
        return ""

    if pulse_length is None:
        pulse_length = max(MIN_BURST_US, min(timings))

    bits = []
    for duration in timings[::2]:   # ON pulses only
        ratio = duration / pulse_length
        bits.append("1" if ratio < 2 else "0")

    return "".join(bits)


def capture_signal(rx_pin, timeout_sec):
    """
    Poll the RXB6 DATA pin and record alternating ON/OFF pulse durations.

    Returns a flat list of alternating ON, OFF durations in µs, or an empty
    list if no valid signal was detected within *timeout_sec*.
    """
    try:
        import RPi.GPIO as GPIO
    except ImportError as exc:
        log.error(
            "Could not import RPi.GPIO.  Make sure it is installed and you "
            f"are running on a Raspberry Pi.\n  {exc}"
        )
        sys.exit(1)

    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(rx_pin, GPIO.IN)

    deadline   = time.monotonic() + timeout_sec
    timings    = []
    in_burst   = False
    edge_start = time.monotonic()

    log.info(f"Listening for RF signal on GPIO {rx_pin}…")

    try:
        while time.monotonic() < deadline:
            state = GPIO.input(rx_pin)
            now   = time.monotonic()

            if state == GPIO.HIGH:
                if not in_burst:
                    # Rising edge — record preceding OFF duration
                    if timings:
                        timings.append(round((now - edge_start) * 1e6))
                    in_burst   = True
                    edge_start = now
            else:
                if in_burst:
                    # Falling edge — record ON duration
                    on_duration = round((now - edge_start) * 1e6)
                    if on_duration >= MIN_BURST_US:
                        timings.append(on_duration)
                        edge_start = now
                        in_burst   = False

                        if len(timings) >= MIN_EDGE_COUNT:
                            # Enough edges — wait briefly for frame to finish
                            time.sleep(0.020)
                            break
                    else:
                        # Noise spike — ignore
                        in_burst = False

            time.sleep(POLL_INTERVAL)
    finally:
        GPIO.cleanup()

    return timings


def main():
    args = parse_args()
    timings = capture_signal(args.rx_pin, args.timeout)

    if len(timings) < MIN_EDGE_COUNT:
        log.warning("No valid RF signal captured within the timeout window")
        # Exit 0 with empty stdout — rfService maps this to HTTP 408
        sys.exit(0)

    code = timings_to_binary(timings)
    log.info(f"Captured {len(timings)//2} pulses → code: {code}")

    # Print binary code to stdout for the Node process to read
    print(code)
    sys.exit(0)


if __name__ == "__main__":
    main()

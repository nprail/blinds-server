#!/usr/bin/env python3
"""
rf_receive.py – Capture an OOK RF code via the SX1278.

Called by the Node.js rfService when the /api/blinds/learn endpoint is hit.
The script listens for an RF burst, decodes the timing waveform, converts it
to a compact binary string, and **prints the result to stdout** so that the
calling Node process can read it.

Usage:
    python3 rf_receive.py \\
        --timeout   10         \\   # seconds to wait for a signal
        --frequency 433920000  \\   # Hz
        --spi-bus   0          \\
        --spi-device 0         \\
        --reset-pin 22

Exit codes:
    0  – a code was successfully captured (printed on stdout)
    1  – timeout or hardware error
"""

import sys
import time
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s",
                    stream=sys.stderr)
log = logging.getLogger(__name__)

# Minimum burst length we consider a valid transmission (µs)
MIN_BURST_US   = 200
# Minimum number of edges to consider a valid frame
MIN_EDGE_COUNT = 8
# Sampling interval while polling RSSI (seconds)
POLL_INTERVAL  = 0.0001   # 100 µs
# RSSI threshold above which we consider the channel busy (dBm)
RSSI_THRESHOLD = -90


def parse_args():
    p = argparse.ArgumentParser(description="Capture an OOK RF code via SX1278")
    p.add_argument("--timeout",    type=float, default=10.0,        help="Capture window (seconds)")
    p.add_argument("--frequency",  type=int,   default=433_920_000, help="Frequency in Hz")
    p.add_argument("--spi-bus",    type=int,   default=0,           dest="spi_bus")
    p.add_argument("--spi-device", type=int,   default=0,           dest="spi_device")
    p.add_argument("--reset-pin",  type=int,   default=22,          dest="reset_pin")
    return p.parse_args()


def timings_to_binary(timings, pulse_length=None):
    """
    Convert a flat list of ON/OFF durations (µs) to a binary string.

    The shortest pulse is taken as the base pulse length if not supplied.
    Values within 50 % of the base are treated as '1×'; larger values are
    treated as '3×' and generate multiple identical bits.

    This is a best-effort decoder suitable for simple OOK remotes.  For
    complex rolling-code or Manchester-encoded remotes you will need a
    protocol-specific decoder.
    """
    if not timings:
        return ""

    if pulse_length is None:
        pulse_length = max(MIN_BURST_US, min(timings))

    bits = []
    # Iterate over ON pulses only (every other element starting at index 0)
    for i, duration in enumerate(timings[::2]):
        ratio = duration / pulse_length
        if ratio < 2:
            bits.append("1")
        else:
            bits.append("0")

    return "".join(bits)


def capture_signal(radio, timeout_sec):
    """
    Poll the SX1278 RSSI register to detect an OOK burst.

    Returns a flat list of alternating ON/OFF pulse durations in µs, or an
    empty list if nothing was detected within the timeout.

    NOTE: This RSSI-polling approach works for strong nearby signals.  For
    production use, connecting the SX1278 DIO2 pin to a Raspberry Pi GPIO
    and using edge-detection interrupts is far more accurate.
    """
    deadline = time.monotonic() + timeout_sec
    timings  = []
    in_burst = False
    edge_start = time.monotonic()

    log.info("Listening for RF signal…")
    while time.monotonic() < deadline:
        rssi = radio.read_rssi()
        now  = time.monotonic()

        if rssi >= RSSI_THRESHOLD:
            if not in_burst:
                # Rising edge
                if timings:
                    # Record OFF duration since last falling edge
                    timings.append(round((now - edge_start) * 1e6))
                in_burst   = True
                edge_start = now
        else:
            if in_burst:
                # Falling edge
                on_duration = round((now - edge_start) * 1e6)
                if on_duration >= MIN_BURST_US:
                    timings.append(on_duration)
                    edge_start = now
                    in_burst   = False

                    # If we've collected enough edges, wait a bit more for
                    # the frame to complete then stop.
                    if len(timings) >= MIN_EDGE_COUNT:
                        time.sleep(0.020)
                        break
                else:
                    # Noise spike – ignore
                    in_burst = False

        time.sleep(POLL_INTERVAL)

    return timings


def main():
    args = parse_args()

    try:
        from sx1278 import SX1278
    except ImportError as exc:
        log.error(
            "Could not import sx1278 module.  Ensure spidev and RPi.GPIO are "
            f"installed and you are running on a Raspberry Pi.\n  {exc}"
        )
        sys.exit(1)

    radio = SX1278(
        spi_bus=args.spi_bus,
        spi_device=args.spi_device,
        reset_pin=args.reset_pin,
    )
    try:
        radio.open()
        radio.configure_ook(freq_hz=args.frequency)
        radio.start_receive()

        timings = capture_signal(radio, args.timeout)
    finally:
        radio.close()

    if len(timings) < MIN_EDGE_COUNT:
        log.error("No valid RF signal captured")
        sys.exit(1)

    code = timings_to_binary(timings)
    log.info(f"Captured {len(timings)//2} pulses → code: {code}")

    # Print the binary code to stdout for the Node process to read
    print(code)
    sys.exit(0)


if __name__ == "__main__":
    main()

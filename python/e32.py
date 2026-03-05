"""
e32.py – Minimal driver for EBYTE E32 LoRa UART module.

The E32 is a LoRa transceiver with a TTL serial (UART) interface.  In normal
(transparent) mode every byte you write to the UART is transmitted as a LoRa
packet; every received packet is forwarded to the UART as raw bytes.

Supported models:
  E32-433T20D, E32-433T30D, E32-868T20D, E32-915T20D
  (and any EBYTE module using the same UART protocol)

Wiring (Raspberry Pi ↔ E32):
  Pi GPIO 14 (TXD)   → E32 RXD
  Pi GPIO 15 (RXD)   → E32 TXD
  Pi GPIO M0_PIN     → E32 M0
  Pi GPIO M1_PIN     → E32 M1
  Pi GPIO AUX_PIN    → E32 AUX   (optional; pulled HIGH by module when ready)
  3.3 V / 5 V        → E32 VCC   (check your module's datasheet)
  GND                → E32 GND

Operating modes selected by M0 / M1 logic levels:
  M0=0, M1=0  Normal        – transparent TX/RX
  M0=0, M1=1  Wake-up       – prepends a preamble to wake sleeping receivers
  M0=1, M1=0  Power-saving  – duty-cycle receive
  M0=1, M1=1  Sleep/config  – accepts AT-style configuration commands
"""

import time
import serial
import RPi.GPIO as GPIO


class E32:
    """Minimal EBYTE E32 LoRa UART driver (transparent mode only)."""

    def __init__(
        self,
        port='/dev/ttyS0',
        baud=9600,
        m0_pin=17,
        m1_pin=27,
        aux_pin=None,
    ):
        self.port    = port
        self.baud    = baud
        self.m0_pin  = m0_pin
        self.m1_pin  = m1_pin
        self.aux_pin = aux_pin
        self.ser     = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def open(self):
        """Configure GPIO, open the serial port, and enter normal mode."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(self.m0_pin, GPIO.OUT)
        GPIO.setup(self.m1_pin, GPIO.OUT)
        if self.aux_pin is not None:
            GPIO.setup(self.aux_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

        self.ser = serial.Serial(
            self.port,
            baudrate=self.baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1,
        )

        self._set_normal_mode()
        self._wait_aux()

    def close(self):
        """Release serial port and GPIO resources."""
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.ser = None
        GPIO.cleanup()

    # ── Mode control ──────────────────────────────────────────────────────────

    def _set_normal_mode(self):
        """M0=LOW, M1=LOW → normal transparent TX/RX mode."""
        GPIO.output(self.m0_pin, GPIO.LOW)
        GPIO.output(self.m1_pin, GPIO.LOW)
        time.sleep(0.1)

    def _set_config_mode(self):
        """M0=HIGH, M1=HIGH → sleep/configuration mode (AT commands)."""
        GPIO.output(self.m0_pin, GPIO.HIGH)
        GPIO.output(self.m1_pin, GPIO.HIGH)
        time.sleep(0.1)

    # ── AUX ready detection ───────────────────────────────────────────────────

    def _wait_aux(self, timeout=3.0):
        """
        Block until AUX goes HIGH (module is ready) or *timeout* seconds pass.
        Falls back to a short fixed delay when aux_pin is not configured.
        """
        if self.aux_pin is None:
            time.sleep(0.1)
            return
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if GPIO.input(self.aux_pin) == GPIO.HIGH:
                return
            time.sleep(0.010)
        # Timeout – proceed anyway; the module may still be functional

    # ── Data exchange ─────────────────────────────────────────────────────────

    def transmit(self, data: bytes):
        """
        Write *data* to the UART in transparent mode; the E32 transmits it
        as a LoRa packet.

        At the factory default air data rate (2.4 kbps) each byte takes
        roughly 3.3 ms on air.  A 250 ms guard is added after writing.
        """
        self._wait_aux()
        self.ser.write(data)
        # On-air time estimate + guard
        time.sleep(0.250 + len(data) * 0.004)
        self._wait_aux()

    def receive(self, timeout_sec=10) -> bytes:
        """
        Listen for an incoming LoRa packet for up to *timeout_sec* seconds.

        Returns the raw received bytes, or an empty bytes object if nothing
        arrived within the timeout.
        """
        self.ser.timeout = 1.0
        deadline = time.monotonic() + timeout_sec
        buf = b''
        while time.monotonic() < deadline:
            chunk = self.ser.read(256)
            if chunk:
                buf += chunk
                # Drain any bytes still arriving for this frame
                time.sleep(0.050)
                self.ser.timeout = 0.1
                extra = self.ser.read(256)
                if extra:
                    buf += extra
                break
        return buf

"""
sx1278.py – Low-level SX1278 driver for OOK (On-Off Keying) mode.

The SX1278 is configured in FSK/OOK mode (NOT LoRa mode) so that it acts
as a simple 433.92 MHz carrier that can be gated on/off to reproduce the
timing waveform used by AC123-16D-style blind remotes.

Wiring (Raspberry Pi ↔ SX1278):
  Pi GPIO  8  (SPI0 CE0) → NSS
  Pi GPIO 10  (SPI0 MOSI) → MOSI
  Pi GPIO  9  (SPI0 MISO) → MISO
  Pi GPIO 11  (SPI0 SCLK) → SCK
  Pi GPIO 22              → RESET  (configurable, see --reset-pin)
  Pi GPIO 25              → DIO0   (configurable, optional)
  3.3 V                   → VCC
  GND                     → GND

SX1278 OOK mode overview:
  The SX1278 supports OOK continuous-mode transmission where the DIO2 pin
  gates the PA (power-amplifier).  Driving DIO2 HIGH turns the carrier ON;
  driving it LOW turns it OFF.  This lets us produce any arbitrary pulse
  waveform by toggling a plain GPIO pin.

  Alternatively (used here) we toggle the SX1278 between TX and STANDBY
  mode via SPI for each pulse.  This is slower but does not require an
  extra GPIO pin wired to DIO2.
"""

import time
import spidev
import RPi.GPIO as GPIO

# ── SX1278 register addresses ─────────────────────────────────────────────────
REG_FIFO            = 0x00
REG_OP_MODE         = 0x01
REG_BITRATE_MSB     = 0x02
REG_BITRATE_LSB     = 0x03
REG_FRF_MSB         = 0x06
REG_FRF_MID         = 0x07
REG_FRF_LSB         = 0x08
REG_PA_CONFIG       = 0x09
REG_OCP             = 0x0B
REG_LNA             = 0x0C
REG_RX_CONFIG       = 0x0D
REG_RSSI_CONFIG     = 0x0E
REG_OOK_PEAK        = 0x1B
REG_OOK_AVG         = 0x1C
REG_OOK_FIX        = 0x1D
REG_PA_DAC          = 0x4D

# ── Operating modes ───────────────────────────────────────────────────────────
MODE_SLEEP          = 0x00
MODE_STDBY          = 0x01
MODE_TX             = 0x03
MODE_RX_CONTINUOUS  = 0x05

# ── Modulation ────────────────────────────────────────────────────────────────
MODULATION_FSK      = 0b00 << 5
MODULATION_OOK      = 0b01 << 5

# ── Crystal oscillator frequency (Hz) ────────────────────────────────────────
FXOSC = 32_000_000
FSTEP = FXOSC / (2 ** 19)   # ≈ 61.035 Hz per step


class SX1278:
    """Minimal SX1278 driver for OOK transmission and reception."""

    def __init__(self, spi_bus=0, spi_device=0, reset_pin=22):
        self.spi_bus    = spi_bus
        self.spi_device = spi_device
        self.reset_pin  = reset_pin
        self.spi        = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def open(self):
        """Initialise SPI bus and GPIO, then reset and configure the chip."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(self.reset_pin, GPIO.OUT)

        self.spi = spidev.SpiDev()
        self.spi.open(self.spi_bus, self.spi_device)
        self.spi.max_speed_hz = 5_000_000
        self.spi.mode = 0b00

        self._reset()

    def close(self):
        """Put the chip into sleep and release hardware resources."""
        if self.spi:
            try:
                self._set_mode(MODE_SLEEP)
            except Exception:
                pass
            self.spi.close()
            self.spi = None
        GPIO.cleanup()

    # ── Reset ─────────────────────────────────────────────────────────────────

    def _reset(self):
        GPIO.output(self.reset_pin, GPIO.LOW)
        time.sleep(0.001)
        GPIO.output(self.reset_pin, GPIO.HIGH)
        time.sleep(0.005)

    # ── SPI read / write ──────────────────────────────────────────────────────

    def _write_reg(self, address, value):
        self.spi.xfer2([address | 0x80, value])

    def _read_reg(self, address):
        result = self.spi.xfer2([address & 0x7F, 0x00])
        return result[1]

    # ── Mode helpers ──────────────────────────────────────────────────────────

    def _set_mode(self, mode, modulation=MODULATION_OOK):
        """
        Write RegOpMode.

        Bit[7]:   0 = FSK/OOK (NOT LoRa)
        Bit[6:5]: modulation type (00=FSK, 01=OOK)
        Bit[2:0]: mode
        """
        self._write_reg(REG_OP_MODE, modulation | mode)
        time.sleep(0.001)

    # ── Frequency ─────────────────────────────────────────────────────────────

    def set_frequency(self, freq_hz):
        """Set carrier frequency in Hz (e.g. 433_920_000)."""
        frf = round(freq_hz / FSTEP)
        self._write_reg(REG_FRF_MSB, (frf >> 16) & 0xFF)
        self._write_reg(REG_FRF_MID, (frf >>  8) & 0xFF)
        self._write_reg(REG_FRF_LSB,  frf        & 0xFF)

    # ── Output power ──────────────────────────────────────────────────────────

    def set_tx_power(self, dbm=17, use_pa_boost=True):
        """
        Configure PA output power.
        With PA_BOOST (pin 18): +2 to +17 dBm (or +20 dBm with PA_DAC).
        Without PA_BOOST:       -1 to +14 dBm.
        """
        if use_pa_boost:
            if dbm > 17:
                # Enable +20 dBm mode
                self._write_reg(REG_PA_DAC, 0x87)
                dbm = max(5, min(20, dbm))
                self._write_reg(REG_PA_CONFIG, 0x80 | (dbm - 5))
            else:
                self._write_reg(REG_PA_DAC, 0x84)
                dbm = max(2, min(17, dbm))
                self._write_reg(REG_PA_CONFIG, 0x80 | (dbm - 2))
        else:
            self._write_reg(REG_PA_DAC, 0x84)
            dbm = max(-1, min(14, dbm))
            self._write_reg(REG_PA_CONFIG, (dbm + 1) & 0x0F)

    # ── OOK configuration ─────────────────────────────────────────────────────

    def configure_ook(self, freq_hz=433_920_000, bitrate_bps=4800):
        """
        Set up the SX1278 for OOK continuous mode.

        bitrate_bps is not used for the waveform generation (we bit-bang
        timings ourselves) but sets the chip's OOK demodulator bandwidth
        when receiving.
        """
        self._set_mode(MODE_SLEEP)

        # Frequency
        self.set_frequency(freq_hz)

        # Bit rate registers (used for RX; we ignore them during TX bit-bang)
        br = max(1, round(FXOSC / bitrate_bps))
        self._write_reg(REG_BITRATE_MSB, (br >> 8) & 0xFF)
        self._write_reg(REG_BITRATE_LSB,  br        & 0xFF)

        # OOK peak-detector threshold
        self._write_reg(REG_OOK_PEAK, 0x28)   # peak-mode, 0.5 dB/step

        # PA: max power, PA_BOOST pin
        self.set_tx_power(17)

        # Back to standby
        self._set_mode(MODE_STDBY)

    # ── Transmit waveform ─────────────────────────────────────────────────────

    def transmit_timings(self, timings_us, repeat=3):
        """
        Transmit an OOK waveform described as a flat list of alternating
        ON/OFF pulse durations in microseconds.

        timings_us: [on1, off1, on2, off2, ...]

        Each pair toggles the carrier on for `on` µs, then off for `off` µs.
        We achieve OOK gating by rapidly switching the chip between TX and
        STANDBY modes via SPI.  This is slightly slower than DIO2-gating but
        avoids an extra GPIO wire.
        """
        for _ in range(repeat):
            pairs = list(zip(timings_us[0::2], timings_us[1::2]))
            for on_us, off_us in pairs:
                # Carrier ON
                self._write_reg(REG_OP_MODE, MODULATION_OOK | MODE_TX)
                time.sleep(on_us * 1e-6)

                # Carrier OFF
                self._write_reg(REG_OP_MODE, MODULATION_OOK | MODE_STDBY)
                time.sleep(off_us * 1e-6)

            # Inter-frame gap
            time.sleep(0.010)

    # ── Receive helpers ───────────────────────────────────────────────────────

    def start_receive(self):
        """Switch chip into continuous RX mode."""
        self._set_mode(MODE_RX_CONTINUOUS)

    def read_rssi(self):
        """Return the current RSSI in dBm."""
        return -(self._read_reg(0x11) / 2)

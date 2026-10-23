/**
 * Stellar public key (G-address) validation.
 *
 * A valid Stellar address:
 *  - starts with 'G'
 *  - is exactly 56 characters long
 *  - uses base32 alphabet (A-Z, 2-7)
 *
 * Full checksum verification requires the base32 decode + CRC-16/XMODEM
 * algorithm specified in SEP-0023 / XDR StrKey encoding. We implement
 * that here so invalid addresses with the right length/prefix are also
 * caught (issue #17).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32DecodeBytes(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(Math.floor((input.length * 5) / 8));

  for (let i = 0; i < input.length; i++) {
    const charIndex = BASE32_ALPHABET.indexOf(input[i]);
    if (charIndex === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | charIndex;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return output;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Returns true if the address is a structurally valid Stellar G-address,
 * including the CRC-16 checksum embedded in the StrKey encoding.
 */
export function isValidStellarAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (!address.startsWith('G')) return false;
  if (address.length !== 56) return false;
  if (!/^[A-Z2-7]{56}$/.test(address)) return false;

  try {
    const decoded = base32DecodeBytes(address); // 35 bytes: 1 version + 32 key + 2 checksum
    if (decoded.length < 35) return false;
    const payload  = decoded.slice(0, 33); // version byte + 32-byte key
    const checksum = decoded.slice(33, 35);
    const computed = crc16(payload);
    // Checksum is stored little-endian
    return checksum[0] === (computed & 0xff) && checksum[1] === (computed >> 8);
  } catch {
    return false;
  }
}

/** Returns true if the string is empty (no address entered yet). */
export function isStellarAddressEmpty(address: string): boolean {
  return address.trim() === '';
}

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

/*
 * Password hashing with Node's built-in scrypt (no extra dependency).
 * Stored as "salt:hash", both hex. Kept free of server-only imports so the
 * seed script can use it too.
 */

const KEY_LENGTH = 64

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await derive(password, salt)
  return `${salt.toString("hex")}:${hash.toString("hex")}`
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":")
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  if (expected.length !== KEY_LENGTH) return false
  const actual = await derive(password, Buffer.from(saltHex, "hex"))
  return timingSafeEqual(actual, expected)
}

/** A real hash to compare against when the username does not exist, so timing does not reveal it. */
export const DUMMY_HASH =
  "00000000000000000000000000000000:" + "00".repeat(KEY_LENGTH)

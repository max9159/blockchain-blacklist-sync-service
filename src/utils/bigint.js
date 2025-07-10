/**
 * Safely converts BigInt values to numbers
 * @param {BigInt|number|string} value - The value to convert
 * @returns {number} - The converted number
 */
export function safeToNumber(value) {
  if (typeof value === 'bigint') {
    // Check if BigInt is too large to be safely converted to number
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new Error(`BigInt value ${value} is too large to safely convert to number`);
    }
    return Number(value);
  }
  
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Cannot convert string "${value}" to number`);
    }
    return parsed;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  throw new Error(`Cannot convert ${typeof value} to number`);
}

/**
 * Safely converts BigInt values to strings
 * @param {BigInt|number|string} value - The value to convert
 * @returns {string} - The converted string
 */
export function safeToString(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  throw new Error(`Cannot convert ${typeof value} to string`);
}

/**
 * Safely handles Math operations with BigInt values
 * @param {BigInt|number} a - First value
 * @param {BigInt|number} b - Second value
 * @returns {number} - The minimum value as a number
 */
export function safeMin(a, b) {
  return Math.min(safeToNumber(a), safeToNumber(b));
}

/**
 * Safely handles Math operations with BigInt values
 * @param {BigInt|number} a - First value
 * @param {BigInt|number} b - Second value
 * @returns {number} - The maximum value as a number
 */
export function safeMax(a, b) {
  return Math.max(safeToNumber(a), safeToNumber(b));
} 
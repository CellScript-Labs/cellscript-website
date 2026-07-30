/** Serialize JSON with deterministic ASCII escapes for generated-data stability. */
export function jsonWithAsciiEscapes(value, indentation = 2) {
  return JSON.stringify(value, null, indentation).replace(/[\u007f-\uffff]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

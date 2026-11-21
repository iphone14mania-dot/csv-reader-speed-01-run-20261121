// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns
// exactly csv-reader's answer {columns, rows, errors} for every input, faster.
//
// csv-reader reads one character at a time and builds every field a character at
// a time. This reads the same way — one pass, left to right, same broken-row
// policy — but finds each field's end with a short index scan and takes the
// field with one slice, so the common unquoted field costs one slice and one
// push instead of a call and a rope per character. Quoted fields are found with
// indexOf('"') (doubled quotes skipped two at a time) and taken with one slice,
// collapsing "" to " only when one is present, converting CR/CRLF inside quotes
// to LF only when one is present. No caching between calls, no state kept.
//
// Policy (csv-reader 1.0.0, kept exactly):
// - U+FEFF at the very start is dropped; a record ends at LF or CRLF; a line
//   left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with a quote runs to the next quote that is not doubled;
//   "" inside is one quote; CRLF or a lone CR inside is read as LF; what
//   follows the closing quote up to the next comma or line break is appended
//   as it stands (quote_junk, when the field ends); a quote that never closes
//   is a literal character and the text after it is read again as unquoted
//   (unterminated_quote). A quote inside an unquoted field is literal.
// - Fields stay strings, never trimmed or converted; columns is the first
//   record when header is true, else null; rows are padded with "" (short_row)
//   or cut (long_row) to the first record's width; errors are {code, line, row}
//   in the order met, line the 1-based line the record starts on, row its
//   index in rows (null for the header).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;
const CR = 3; // a lone carriage return: a line break when followed by LF, else dropped (stray_cr)

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    // The record being read: the line it starts on and the index in rows it takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let quoted = false;

    while (ended === COMMA) {
      if (text.charCodeAt(pos) === 34) {
        // A quoted field: the opening quote is at pos.
        quoted = true;
        const open = pos;
        const openLine = line;
        let q = text.indexOf('"', pos + 1);
        while (q !== -1 && text.charCodeAt(q + 1) === 34) q = text.indexOf('"', q + 2);
        if (q === -1) {
          // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          line = openLine;
          // Unquoted re-read with the opening quote as the first character.
          let value = '"';
          let start = pos;
          let i = pos;
          for (;;) {
            let d = n;
            let kind = END;
            while (i < n) {
              const c = text.charCodeAt(i);
              if (c === 44) { d = i; kind = COMMA; break; }
              if (c === 10) { d = i; kind = LINE_BREAK; break; }
              if (c === 13) { d = i; kind = CR; break; }
              i += 1;
            }
            if (kind === COMMA) { value += text.slice(start, d); pos = d + 1; ended = COMMA; break; }
            if (kind === LINE_BREAK) { value += text.slice(start, d); pos = d + 1; line += 1; ended = LINE_BREAK; break; }
            if (kind === END) { value += text.slice(start, n); pos = n; ended = END; break; }
            // A CR: a line break when followed by LF, else dropped (stray_cr).
            if (text.charCodeAt(d + 1) === 10) { value += text.slice(start, d); pos = d + 2; line += 1; ended = LINE_BREAK; break; }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            value += text.slice(start, d);
            i = d + 1;
            start = d + 1;
          }
          fields.push(value);
          continue;
        }
        // The quoted content, [open+1, q): "" inside is one quote, CRLF and a lone CR are each one LF.
        let value = text.slice(open + 1, q);
        // One pass over the segment: doubled quotes, CRs and LFs. A CRLF inside
        // quotes is one line, as is a lone CR or a lone LF: count every CR, and
        // every LF not part of a CRLF.
        let hasQuote = false;
        let hasCR = false;
        let add = 0;
        for (let i = 0; i < value.length; i++) {
          const c = value.charCodeAt(i);
          if (c === 34) hasQuote = true;
          else if (c === 13) { hasCR = true; add += 1; }
          else if (c === 10 && (i === 0 || value.charCodeAt(i - 1) !== 13)) add += 1;
        }
        if (hasQuote) value = value.replace(/""/g, '"');
        if (hasCR) value = value.replace(/\r\n?/g, '\n');
        line += add;
        pos = q + 1;
        if (pos >= n) {
          fields.push(value);
          ended = END;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            pos += 1;
            fields.push(value);
            ended = COMMA;
          } else if (c === 10) {
            pos += 1;
            line += 1;
            fields.push(value);
            ended = LINE_BREAK;
          } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line += 1;
            fields.push(value);
            ended = LINE_BREAK;
          } else {
            // What follows the closing quote is appended as it stands, up to the next comma or line break.
            let added = 0;
            let start = pos;
            let i = pos;
            for (;;) {
              let d = n;
              let kind = END;
              while (i < n) {
                const c2 = text.charCodeAt(i);
                if (c2 === 44) { d = i; kind = COMMA; break; }
                if (c2 === 10) { d = i; kind = LINE_BREAK; break; }
                if (c2 === 13) { d = i; kind = CR; break; }
                i += 1;
              }
              if (kind === COMMA) { value += text.slice(start, d); added += d - start; pos = d + 1; ended = COMMA; break; }
              if (kind === LINE_BREAK) { value += text.slice(start, d); added += d - start; pos = d + 1; line += 1; ended = LINE_BREAK; break; }
              if (kind === END) { value += text.slice(start, n); added += n - start; pos = n; ended = END; break; }
              if (text.charCodeAt(d + 1) === 10) { value += text.slice(start, d); added += d - start; pos = d + 2; line += 1; ended = LINE_BREAK; break; }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              value += text.slice(start, d);
              added += d - start;
              i = d + 1;
              start = d + 1;
            }
            if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            fields.push(value);
          }
        }
      } else {
        // An unquoted field: to the next comma or line break, a CR not followed by LF dropped (stray_cr).
        quoted = false;
        let value = '';
        let start = pos;
        let i = pos;
        for (;;) {
          let d = n;
          let kind = END;
          while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 44) { d = i; kind = COMMA; break; }
            if (c === 10) { d = i; kind = LINE_BREAK; break; }
            if (c === 13) { d = i; kind = CR; break; }
            i += 1;
          }
          if (kind === COMMA) { value += text.slice(start, d); pos = d + 1; ended = COMMA; break; }
          if (kind === LINE_BREAK) { value += text.slice(start, d); pos = d + 1; line += 1; ended = LINE_BREAK; break; }
          if (kind === END) { value += text.slice(start, n); pos = n; ended = END; break; }
          if (text.charCodeAt(d + 1) === 10) { value += text.slice(start, d); pos = d + 2; line += 1; ended = LINE_BREAK; break; }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          value += text.slice(start, d);
          i = d + 1;
          start = d + 1;
        }
        fields.push(value);
      }
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

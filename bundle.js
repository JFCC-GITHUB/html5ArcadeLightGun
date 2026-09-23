(() => {
  // node_modules/smol-toml/dist/date.js
  var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
  var TomlDate = class _TomlDate extends Date {
    #hasDate = false;
    #hasTime = false;
    #offset = null;
    constructor(date) {
      let hasDate = true;
      let hasTime = true;
      let offset = "Z";
      if (typeof date === "string") {
        let match = date.match(DATE_TIME_RE);
        if (match) {
          if (!match[1]) {
            hasDate = false;
            date = `0000-01-01T${date}`;
          }
          hasTime = !!match[2];
          hasTime && date[10] === " " && (date = date.replace(" ", "T"));
          if (match[2] && +match[2] > 23) {
            date = "";
          } else {
            offset = match[3] || null;
            date = date.toUpperCase();
            if (!offset && hasTime)
              date += "Z";
          }
        } else {
          date = "";
        }
      }
      super(date);
      if (!isNaN(this.getTime())) {
        this.#hasDate = hasDate;
        this.#hasTime = hasTime;
        this.#offset = offset;
      }
    }
    isDateTime() {
      return this.#hasDate && this.#hasTime;
    }
    isLocal() {
      return !this.#hasDate || !this.#hasTime || !this.#offset;
    }
    isDate() {
      return this.#hasDate && !this.#hasTime;
    }
    isTime() {
      return this.#hasTime && !this.#hasDate;
    }
    isValid() {
      return this.#hasDate || this.#hasTime;
    }
    toISOString() {
      let iso = super.toISOString();
      if (this.isDate())
        return iso.slice(0, 10);
      if (this.isTime())
        return iso.slice(11, 23);
      if (this.#offset === null)
        return iso.slice(0, -1);
      if (this.#offset === "Z")
        return iso;
      let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
      offset = this.#offset[0] === "-" ? offset : -offset;
      let offsetDate = new Date(this.getTime() - offset * 6e4);
      return offsetDate.toISOString().slice(0, -1) + this.#offset;
    }
    static wrapAsOffsetDateTime(jsDate, offset = "Z") {
      let date = new _TomlDate(jsDate);
      date.#offset = offset;
      return date;
    }
    static wrapAsLocalDateTime(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#offset = null;
      return date;
    }
    static wrapAsLocalDate(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#hasTime = false;
      date.#offset = null;
      return date;
    }
    static wrapAsLocalTime(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#hasDate = false;
      date.#offset = null;
      return date;
    }
  };

  // node_modules/smol-toml/dist/error.js
  function getLineColFromPtr(string, ptr) {
    let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
    return [lines.length, lines.pop().length + 1];
  }
  function makeCodeBlock(string, line, column) {
    let lines = string.split(/\r\n|\n|\r/g);
    let codeblock = "";
    let numberLen = (Math.log10(line + 1) | 0) + 1;
    for (let i = line - 1; i <= line + 1; i++) {
      let l = lines[i - 1];
      if (!l)
        continue;
      codeblock += i.toString().padEnd(numberLen, " ");
      codeblock += ":  ";
      codeblock += l;
      codeblock += "\n";
      if (i === line) {
        codeblock += " ".repeat(numberLen + column + 2);
        codeblock += "^\n";
      }
    }
    return codeblock;
  }
  var TomlError = class extends Error {
    line;
    column;
    codeblock;
    constructor(message, options) {
      const [line, column] = getLineColFromPtr(options.toml, options.ptr);
      const codeblock = makeCodeBlock(options.toml, line, column);
      super(`Invalid TOML document: ${message}

${codeblock}`, options);
      this.line = line;
      this.column = column;
      this.codeblock = codeblock;
    }
  };

  // node_modules/smol-toml/dist/util.js
  function indexOfNewline(str, start = 0) {
    let idx = str.indexOf("\n", start);
    if (str.charCodeAt(idx - 1) === 13)
      idx--;
    return idx;
  }
  function skipComment(ctx) {
    for (; ctx.p < ctx.s.length; ctx.p++) {
      let c = ctx.s.charCodeAt(ctx.p);
      if (c === 10)
        break;
      if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
        ctx.p++;
        break;
      }
      if (c < 32 && c !== 9 || c === 127) {
        throw new TomlError("control characters are not allowed in comments", {
          toml: ctx.s,
          ptr: ctx.p
        });
      }
    }
  }
  function skipVoid(ctx, banNewLines, banComments) {
    let c;
    while (1) {
      while ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10))
        ctx.p++;
      if (banComments || c !== 35)
        break;
      skipComment(ctx);
    }
  }
  function skipUntil(ctx, sep, end) {
    let ptr = ctx.p;
    if (!end) {
      ptr = indexOfNewline(ctx.s, ptr);
      ctx.p = ptr < 0 ? ctx.s.length : ptr;
      return;
    }
    for (; ctx.p < ctx.s.length; ctx.p++) {
      let c = ctx.s.charCodeAt(ctx.p);
      if (c === 35) {
        skipComment(ctx);
      } else if (c === end || c === sep) {
        return;
      }
    }
    throw new TomlError("cannot find end of structure", {
      toml: ctx.s,
      ptr
    });
  }

  // node_modules/smol-toml/dist/primitive.js
  var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
  var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
  var LEADING_ZERO = /^[+-]?0[0-9_]/;
  function parseString(ctx) {
    let start = ctx.p;
    let c = ctx.s.charCodeAt(ctx.p++);
    let first = c;
    let isLiteral = c === 39;
    let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
    if (isMultiline) {
      if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
        ctx.p++;
      else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
        ctx.p += 2;
    }
    let parsed = "";
    let sliceStart = ctx.p;
    let state = 0;
    for (; ctx.p < ctx.s.length; ctx.p++) {
      c = ctx.s.charCodeAt(ctx.p);
      if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
        state = state && 3;
      } else if (c < 32 && c !== 9 || c === 127) {
        throw new TomlError("control characters are not allowed in strings", {
          toml: ctx.s,
          ptr: ctx.p
        });
      } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
        if (isMultiline) {
          if (ctx.s.charCodeAt(ctx.p + 3) === first)
            ctx.p++;
          if (ctx.s.charCodeAt(ctx.p + 3) === first)
            ctx.p++;
        }
        if (!state)
          parsed += ctx.s.slice(sliceStart, ctx.p);
        ctx.p += isMultiline ? 3 : 1;
        return parsed;
      } else if (!state) {
        if (!isLiteral && c === 92) {
          parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
          state = 1;
        }
      } else if (state === 1) {
        if (c === 120 || c === 117 || c === 85) {
          let value = 0;
          let len = c === 120 ? 2 : c === 117 ? 4 : 8;
          for (let j = 0; j < len; j++, ctx.p++) {
            let hex = ctx.s.charCodeAt(ctx.p + 1);
            let digit = (
              /* 0-9 */
              hex >= 48 && hex <= 57 ? hex - 48 : (
                /* A-F */
                hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                  /* a-f */
                  hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
                )
              )
            );
            if (digit < 0)
              throw new TomlError("invalid non-hex character in unicode escape", { toml: ctx.s, ptr: ctx.p + 1 });
            value = value << 4 | digit;
          }
          if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
            throw new TomlError("invalid unicode escape", { toml: ctx.s, ptr: ctx.p });
          }
          parsed += String.fromCodePoint(value);
          sliceStart = ctx.p + 1;
          state = 0;
        } else if (c === 32 || c === 9) {
          state = 2;
        } else {
          if (c === 98)
            parsed += "\b";
          else if (c === 116)
            parsed += "	";
          else if (c === 110)
            parsed += "\n";
          else if (c === 102)
            parsed += "\f";
          else if (c === 114)
            parsed += "\r";
          else if (c === 101)
            parsed += "\x1B";
          else if (c === 34)
            parsed += '"';
          else if (c === 92)
            parsed += "\\";
          else
            throw new TomlError("unrecognized escape sequence", { toml: ctx.s, ptr: ctx.p });
          sliceStart = ctx.p + 1;
          state = 0;
        }
      } else if (c !== 32 && c !== 9) {
        if (state === 2) {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: ctx.s,
            ptr: sliceStart
          });
        }
        state = !isLiteral && c === 92 ? 1 : 0;
        sliceStart = ctx.p;
      }
    }
    throw new TomlError("unfinished string", { toml: ctx.s, ptr: start });
  }
  function sliceAndTrimEndOf(ctx, start, end) {
    let value = ctx.s.slice(start, end);
    let commentIdx = value.indexOf("#");
    if (commentIdx > 0) {
      skipComment({ s: value, p: commentIdx, d: 0 });
      value = value.slice(0, commentIdx);
    }
    return value.trimEnd();
  }
  function parseValue(ctx, integersAsBigInt, end) {
    let ptr = ctx.p;
    let err = { toml: ctx.s, ptr };
    skipUntil(ctx, 44, end);
    let value = sliceAndTrimEndOf(ctx, ptr, ctx.p);
    if (!value)
      throw new TomlError("incomplete declaration: value expected", err);
    if (value === "-inf")
      return -Infinity;
    if (value === "inf" || value === "+inf")
      return Infinity;
    if (value === "nan" || value === "+nan" || value === "-nan")
      return NaN;
    if (value === "-0")
      return integersAsBigInt ? 0n : 0;
    let isInt = INT_REGEX.test(value);
    if (isInt || FLOAT_REGEX.test(value)) {
      if (LEADING_ZERO.test(value)) {
        throw new TomlError("leading zeroes are not allowed", err);
      }
      value = value.replace(/_/g, "");
      let numeric = +value;
      if (isNaN(numeric)) {
        throw new TomlError("invalid number", err);
      }
      if (isInt) {
        if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
          throw new TomlError("integer value cannot be represented losslessly", err);
        }
        if (isInt || integersAsBigInt === true)
          numeric = BigInt(value);
      }
      return numeric;
    }
    const date = new TomlDate(value);
    if (!date.isValid())
      throw new TomlError("invalid value", err);
    return date;
  }

  // node_modules/smol-toml/dist/extract.js
  function extractValue(ctx, end, integersAsBigInt) {
    let ptr = ctx.p;
    let c = ctx.s.charCodeAt(ptr);
    if (c === 91 || c === 123) {
      if (!ctx.d--) {
        throw new TomlError("document contains excessively nested structures. aborting.", {
          toml: ctx.s,
          ptr
        });
      }
      let value = c === 91 ? parseArray(ctx, integersAsBigInt) : parseInlineTable(ctx, integersAsBigInt);
      ctx.d++;
      return value;
    }
    if (c === 34 || c === 39) {
      return parseString(ctx);
    }
    if (c === 116) {
      if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
        throw new TomlError("invalid value", { toml: ctx.s, ptr });
      ctx.p++;
      return true;
    }
    if (c === 102) {
      if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
        throw new TomlError("invalid value", { toml: ctx.s, ptr });
      ctx.p++;
      return false;
    }
    return parseValue(ctx, integersAsBigInt, end);
  }

  // node_modules/smol-toml/dist/struct.js
  var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
  function parseKey(ctx, end = "=") {
    let start = ctx.p;
    let dot = start - 1;
    let parsed = [];
    let endPtr = ctx.s.indexOf(end, start);
    if (endPtr < 0) {
      throw new TomlError("incomplete key-value: cannot find end of key", {
        toml: ctx.s,
        ptr: start
      });
    }
    do {
      let c = ctx.s.charCodeAt(ctx.p = ++dot);
      if (c !== 32 && c !== 9) {
        if (c === 34 || c === 39) {
          if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2)) {
            throw new TomlError("multiline strings are not allowed in keys", {
              toml: ctx.s,
              ptr: ctx.p
            });
          }
          let part = parseString(ctx);
          dot = ctx.s.indexOf(".", ctx.p);
          let strEnd = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
          let newLine = indexOfNewline(strEnd);
          if (newLine > -1) {
            throw new TomlError("newlines are not allowed in keys", {
              toml: ctx.s,
              ptr: newLine
            });
          }
          if (strEnd.trimStart()) {
            throw new TomlError("found extra tokens after the string part", {
              toml: ctx.s,
              ptr: ctx.p
            });
          }
          if (endPtr < ctx.p) {
            endPtr = ctx.s.indexOf(end, ctx.p);
            if (endPtr < 0) {
              throw new TomlError("incomplete key-value: cannot find end of key", {
                toml: ctx.s,
                ptr: start
              });
            }
          }
          parsed.push(part);
        } else {
          dot = ctx.s.indexOf(".", ctx.p);
          let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
          if (!KEY_PART_RE.test(part)) {
            throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
              toml: ctx.s,
              ptr: ctx.p
            });
          }
          parsed.push(part.trimEnd());
        }
      }
    } while (dot + 1 && dot < endPtr);
    ctx.p = endPtr + 1;
    skipVoid(ctx, true, true);
    return parsed;
  }
  function parseInlineTable(ctx, integersAsBigInt) {
    let res = {};
    let seen = /* @__PURE__ */ new Set();
    let c;
    ctx.p++;
    while (ctx.p < ctx.s.length) {
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
        ctx.p++;
        return res;
      }
      let k;
      let t = res;
      let hasOwn = false;
      let p = ctx.p;
      let key = parseKey(ctx);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: ctx.s,
            ptr: p
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: ctx.s,
          ptr: ctx.p
        });
      }
      let value = extractValue(ctx, 125, integersAsBigInt);
      seen.add(t[k] = value);
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
        return res;
      }
      if (c !== 44) {
        throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
      }
    }
    throw new TomlError("unfinished table encountered", {
      toml: ctx.s,
      ptr: ctx.p
    });
  }
  function parseArray(ctx, integersAsBigInt) {
    let res = [];
    let c;
    ctx.p++;
    while (ctx.p < ctx.s.length) {
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
        ctx.p++;
        return res;
      }
      res.push(extractValue(ctx, 93, integersAsBigInt));
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
        return res;
      }
      if (c !== 44) {
        throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
      }
    }
    throw new TomlError("unfinished array encountered", {
      toml: ctx.s,
      ptr: ctx.p
    });
  }

  // node_modules/smol-toml/dist/parse.js
  function peekTable(key, table, meta, type) {
    let t = table;
    let m = meta;
    let k;
    let hasOwn = false;
    let state;
    for (let i = 0; i < key.length; i++) {
      if (i) {
        t = hasOwn ? t[k] : t[k] = {};
        m = (state = m[k]).c;
        if (type === 0 && (state.t === 1 || state.t === 2)) {
          return null;
        }
        if (state.t === 2) {
          let l = t.length - 1;
          t = t[l];
          m = m[l].c;
        }
      }
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
        return null;
      }
      if (!hasOwn) {
        if (k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
          Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
        }
        m[k] = {
          t: i < key.length - 1 && type === 2 ? 3 : type,
          d: false,
          i: 0,
          c: {}
        };
      }
    }
    state = m[k];
    if (state.t !== type && !(type === 1 && state.t === 3)) {
      return null;
    }
    if (type === 2) {
      if (!state.d) {
        state.d = true;
        t[k] = [];
      }
      t[k].push(t = {});
      state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
    }
    if (state.d) {
      return null;
    }
    state.d = true;
    if (type === 1) {
      t = hasOwn ? t[k] : t[k] = {};
    } else if (type === 0 && hasOwn) {
      return null;
    }
    return [k, t, state.c];
  }
  function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
    let ctx = { s: toml, p: 0, d: maxDepth };
    let res = {};
    let meta = {};
    let tmp;
    let tbl = res;
    let m = meta;
    skipVoid(ctx);
    while (ctx.p < toml.length) {
      if (toml.charCodeAt(ctx.p) === 91) {
        let isTableArray = toml.charCodeAt(++ctx.p) === 91;
        tmp = ctx.p += +isTableArray;
        let k = parseKey(ctx, "]");
        if (isTableArray) {
          if (toml.charCodeAt(ctx.p - 1) !== 93) {
            throw new TomlError("expected end of table declaration", {
              toml,
              ptr: ctx.p - 1
            });
          }
          ctx.p++;
        }
        let p = peekTable(
          k,
          res,
          meta,
          isTableArray ? 2 : 1
          /* Type.EXPLICIT */
        );
        if (!p) {
          throw new TomlError("trying to redefine an already defined table or value", {
            toml,
            ptr: tmp
          });
        }
        m = p[2];
        tbl = p[1];
      } else {
        tmp = ctx.p;
        let k = parseKey(ctx);
        let p = peekTable(
          k,
          tbl,
          m,
          0
          /* Type.DOTTED */
        );
        if (!p) {
          throw new TomlError("trying to redefine an already defined table or value", {
            toml,
            ptr: tmp
          });
        }
        p[1][p[0]] = extractValue(ctx, void 0, integersAsBigInt);
      }
      skipVoid(ctx, true);
      if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && tmp !== 13) {
        throw new TomlError("each key-value declaration must be followed by an end-of-line", {
          toml,
          ptr: ctx.p
        });
      }
      skipVoid(ctx);
    }
    return res;
  }

  // src/config.js
  var DEFAULT_CONFIG = {
    game: {
      title: "Wild West Arcade Light Gun",
      clip_size: 6,
      max_lives: 3,
      starting_lives: 3
    },
    mechanics: {
      recoil_duration_ms: 100,
      recoil_distance_px: 18,
      muzzle_flash_ms: 70,
      bullet_hole_duration_ms: 5e3
    },
    covers: [
      { id: "window_top_left", x: 240, y: 200, width: 60, height: 80, label: "Balcony Left Window" },
      { id: "window_top_right", x: 724, y: 200, width: 60, height: 80, label: "Balcony Right Window" },
      { id: "door_bottom_left", x: 200, y: 440, width: 70, height: 110, label: "Saloon Left Door" },
      { id: "door_bottom_right", x: 754, y: 440, width: 70, height: 110, label: "Saloon Right Door" },
      { id: "balcony_center", x: 480, y: 260, width: 64, height: 90, label: "Balcony Center" }
    ],
    waves: [
      {
        id: 1,
        name: "Wave 1: Dusty Outskirts",
        duration_sec: 30,
        spawn_interval_ms: 1500,
        target_visible_duration_ms: 2200,
        points_outlaw: 100,
        points_civilian_penalty: 200,
        outlaw_ratio: 0.8
      },
      {
        id: 2,
        name: "Wave 2: High Noon Showdown",
        duration_sec: 30,
        spawn_interval_ms: 1100,
        target_visible_duration_ms: 1600,
        points_outlaw: 150,
        points_civilian_penalty: 250,
        outlaw_ratio: 0.7
      },
      {
        id: 3,
        name: "Wave 3: Outlaw Rampage",
        duration_sec: 35,
        spawn_interval_ms: 800,
        target_visible_duration_ms: 1200,
        points_outlaw: 200,
        points_civilian_penalty: 300,
        outlaw_ratio: 0.65
      }
    ]
  };
  async function loadConfig() {
    try {
      const res = await fetch("config/scenes.toml");
      if (res.ok) {
        const text = await res.text();
        const parsed = parse(text);
        console.log("Loaded TOML config successfully:", parsed);
        return parsed;
      }
    } catch (err) {
      console.warn("Could not fetch config/scenes.toml, using default fallback config:", err);
    }
    return DEFAULT_CONFIG;
  }

  // src/assets.js
  var PixelAssets = class {
    constructor() {
      this.outlawCanvas = this.createOutlawSprite();
      this.fastOutlawCanvas = this.createFastOutlawSprite();
      this.civilianCanvas = this.createCivilianSprite();
      this.crosshairCanvas = this.createCrosshairSprite();
      this.bulletHoleCanvas = this.createBulletHoleSprite();
    }
    createCanvas(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      return { canvas, ctx };
    }
    createOutlawSprite() {
      const { canvas, ctx } = this.createCanvas(60, 80);
      ctx.fillStyle = "#4a2511";
      ctx.fillRect(10, 8, 40, 8);
      ctx.fillRect(18, 0, 24, 10);
      ctx.fillStyle = "#b03a2e";
      ctx.fillRect(18, 7, 24, 3);
      ctx.fillStyle = "#f5cba7";
      ctx.fillRect(20, 16, 20, 16);
      ctx.fillStyle = "#1b2631";
      ctx.fillRect(23, 20, 4, 3);
      ctx.fillRect(33, 20, 4, 3);
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(18, 26, 24, 10);
      ctx.fillRect(22, 36, 16, 6);
      ctx.fillStyle = "#78281f";
      ctx.fillRect(14, 40, 32, 28);
      ctx.fillStyle = "#283747";
      ctx.fillRect(22, 42, 16, 26);
      ctx.fillStyle = "#515a5a";
      ctx.fillRect(44, 46, 14, 6);
      ctx.fillRect(42, 50, 6, 10);
      return canvas;
    }
    createFastOutlawSprite() {
      const { canvas, ctx } = this.createCanvas(60, 80);
      ctx.fillStyle = "#1c2833";
      ctx.fillRect(8, 8, 44, 8);
      ctx.fillRect(16, 0, 28, 10);
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(16, 7, 28, 3);
      ctx.fillStyle = "#edbb99";
      ctx.fillRect(20, 16, 20, 16);
      ctx.fillStyle = "#17202a";
      ctx.fillRect(22, 18, 7, 7);
      ctx.fillRect(20, 20, 20, 2);
      ctx.fillRect(32, 19, 5, 3);
      ctx.fillStyle = "#422517";
      ctx.fillRect(21, 28, 18, 4);
      ctx.fillStyle = "#1a5276";
      ctx.fillRect(12, 38, 36, 32);
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(2, 46, 12, 5);
      ctx.fillRect(46, 46, 12, 5);
      return canvas;
    }
    createCivilianSprite() {
      const { canvas, ctx } = this.createCanvas(60, 80);
      ctx.fillStyle = "#f4d03f";
      ctx.fillRect(16, 8, 28, 12);
      ctx.fillStyle = "#f5cba7";
      ctx.fillRect(20, 18, 20, 16);
      ctx.fillStyle = "#2980b9";
      ctx.fillRect(23, 21, 4, 4);
      ctx.fillRect(33, 21, 4, 4);
      ctx.fillStyle = "#78281f";
      ctx.fillRect(27, 28, 6, 5);
      ctx.fillStyle = "#27ae60";
      ctx.fillRect(14, 38, 32, 32);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(20, 42, 20, 28);
      ctx.fillStyle = "#f5cba7";
      ctx.fillRect(6, 16, 8, 22);
      ctx.fillRect(46, 16, 8, 22);
      return canvas;
    }
    createCrosshairSprite() {
      const { canvas, ctx } = this.createCanvas(32, 32);
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(16, 8);
      ctx.moveTo(16, 24);
      ctx.lineTo(16, 32);
      ctx.moveTo(0, 16);
      ctx.lineTo(8, 16);
      ctx.moveTo(24, 16);
      ctx.lineTo(32, 16);
      ctx.stroke();
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(15, 15, 2, 2);
      return canvas;
    }
    createBulletHoleSprite() {
      const { canvas, ctx } = this.createCanvas(16, 16);
      ctx.fillStyle = "#17202a";
      ctx.beginPath();
      ctx.arc(8, 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7f8c8d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 4);
      ctx.lineTo(8, 1);
      ctx.moveTo(8, 12);
      ctx.lineTo(8, 15);
      ctx.moveTo(4, 8);
      ctx.lineTo(1, 8);
      ctx.moveTo(12, 8);
      ctx.lineTo(15, 8);
      ctx.stroke();
      return canvas;
    }
  };

  // src/renderer.js
  var Renderer = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.internalWidth = 1024;
      this.internalHeight = 768;
      this.assets = new PixelAssets();
    }
    clear() {
      this.ctx.fillStyle = "#110803";
      this.ctx.fillRect(0, 0, this.internalWidth, this.internalHeight);
    }
    render(gameState) {
      this.clear();
      this.renderBackground();
      this.renderTargets(gameState.activeTargets);
      this.renderBulletHoles(gameState.bulletHoles);
      this.renderGunOverlay(gameState.recoilOffset);
      if (gameState.muzzleFlashTimer > 0) {
        this.renderMuzzleFlash(gameState.crosshairX, gameState.crosshairY);
      }
      this.renderCrosshair(gameState.crosshairX, gameState.crosshairY);
      this.renderHUD(gameState);
    }
    renderBackground() {
      const ctx = this.ctx;
      const skyGradient = ctx.createLinearGradient(0, 0, 0, 350);
      skyGradient.addColorStop(0, "#d35400");
      skyGradient.addColorStop(0.6, "#e67e22");
      skyGradient.addColorStop(1, "#f39c12");
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, this.internalWidth, 350);
      ctx.fillStyle = "#78281f";
      ctx.beginPath();
      ctx.moveTo(0, 350);
      ctx.lineTo(80, 280);
      ctx.lineTo(200, 280);
      ctx.lineTo(300, 350);
      ctx.lineTo(550, 310);
      ctx.lineTo(700, 310);
      ctx.lineTo(850, 350);
      ctx.lineTo(1024, 320);
      ctx.lineTo(1024, 350);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5c2c16";
      ctx.fillRect(0, 350, this.internalWidth, this.internalHeight - 350);
      ctx.strokeStyle = "#3e1d0e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(100, 390);
      ctx.lineTo(900, 390);
      ctx.moveTo(50, 420);
      ctx.lineTo(950, 420);
      ctx.stroke();
      const saloonX = 180;
      const saloonY = 120;
      const saloonW = 664;
      const saloonH = 460;
      ctx.fillStyle = "#4a2511";
      ctx.fillRect(saloonX, saloonY, saloonW, saloonH);
      ctx.strokeStyle = "#311709";
      ctx.lineWidth = 2;
      for (let py = saloonY + 20; py < saloonY + saloonH; py += 20) {
        ctx.beginPath();
        ctx.moveTo(saloonX, py);
        ctx.lineTo(saloonX + saloonW, py);
        ctx.stroke();
      }
      ctx.fillStyle = "#271207";
      ctx.fillRect(saloonX - 15, saloonY - 15, saloonW + 30, 20);
      ctx.fillStyle = "#f39c12";
      ctx.fillRect(saloonX + 180, saloonY - 45, 304, 40);
      ctx.strokeStyle = "#271207";
      ctx.lineWidth = 4;
      ctx.strokeRect(saloonX + 180, saloonY - 45, 304, 40);
      ctx.fillStyle = "#271207";
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("\u2605 SALOON \u2605", saloonX + saloonW / 2, saloonY - 18);
      ctx.fillStyle = "#311709";
      ctx.fillRect(saloonX - 10, saloonY + 160, saloonW + 20, 16);
      ctx.fillStyle = "#5c2c16";
      for (let rx = saloonX; rx <= saloonX + saloonW; rx += 30) {
        ctx.fillRect(rx, saloonY + 120, 6, 40);
      }
      ctx.fillRect(saloonX, saloonY + 120, saloonW, 6);
      ctx.fillStyle = "#170b04";
      ctx.fillRect(240, 200, 60, 80);
      ctx.fillRect(724, 200, 60, 80);
      ctx.strokeStyle = "#271207";
      ctx.lineWidth = 4;
      ctx.strokeRect(240, 200, 60, 80);
      ctx.strokeRect(724, 200, 60, 80);
      ctx.fillStyle = "#170b04";
      ctx.fillRect(200, 440, 70, 110);
      ctx.fillRect(754, 440, 70, 110);
      this.renderBarrel(380, 460);
      this.renderBarrel(590, 460);
    }
    renderBarrel(x, y) {
      const ctx = this.ctx;
      ctx.fillStyle = "#6e3c1b";
      ctx.fillRect(x, y, 50, 70);
      ctx.fillStyle = "#3a539b";
      ctx.fillRect(x, y + 10, 50, 6);
      ctx.fillRect(x, y + 54, 50, 6);
      ctx.strokeStyle = "#271207";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 50, 70);
    }
    renderTargets(targets) {
      const ctx = this.ctx;
      targets.forEach((target) => {
        let sprite;
        if (target.type === "outlaw") {
          sprite = this.assets.outlawCanvas;
        } else if (target.type === "fast_outlaw") {
          sprite = this.assets.fastOutlawCanvas;
        } else {
          sprite = this.assets.civilianCanvas;
        }
        const popRatio = Math.min(1, target.animTimer / target.animDuration);
        const renderY = target.y + target.height * (1 - popRatio);
        const visibleHeight = target.height * popRatio;
        ctx.save();
        ctx.beginPath();
        ctx.rect(target.x - 5, target.y - 10, target.width + 10, target.height + 15);
        ctx.clip();
        ctx.drawImage(
          sprite,
          0,
          0,
          sprite.width,
          Math.max(1, sprite.height * visibleHeight / target.height),
          target.x,
          renderY,
          target.width,
          visibleHeight
        );
        ctx.restore();
      });
    }
    renderBulletHoles(bulletHoles) {
      const ctx = this.ctx;
      const holeSprite = this.assets.bulletHoleCanvas;
      bulletHoles.forEach((hole) => {
        ctx.drawImage(holeSprite, hole.x - 8, hole.y - 8);
      });
    }
    renderGunOverlay(recoilOffset) {
      const ctx = this.ctx;
      const gunX = this.internalWidth / 2;
      const gunY = this.internalHeight + recoilOffset;
      ctx.fillStyle = "#34495e";
      ctx.fillRect(gunX - 16, gunY - 140, 32, 120);
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(gunX - 4, gunY - 150, 8, 12);
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(gunX - 28, gunY - 40, 56, 50);
      ctx.fillStyle = "#1a252f";
      ctx.fillRect(gunX - 20, gunY - 30, 10, 30);
      ctx.fillRect(gunX - 5, gunY - 30, 10, 30);
      ctx.fillRect(gunX + 10, gunY - 30, 10, 30);
      ctx.fillStyle = "#6e3c1b";
      ctx.fillRect(gunX - 22, gunY + 10, 44, 40);
    }
    renderMuzzleFlash(x, y) {
      const ctx = this.ctx;
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath();
      ctx.arc(x, y, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    renderCrosshair(x, y) {
      if (x === null || y === null)
        return;
      const ctx = this.ctx;
      const sprite = this.assets.crosshairCanvas;
      ctx.drawImage(sprite, x - 16, y - 16);
    }
    renderHUD(gameState) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(26, 12, 2, 0.85)";
      ctx.fillRect(0, 0, this.internalWidth, 54);
      ctx.strokeStyle = "#c85a17";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, this.internalWidth, 54);
      ctx.fillStyle = "#f1c40f";
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = "left";
      ctx.fillText(`SCORE: ${gameState.score || 0}`, 15, 34);
      ctx.fillText(`HIGH: ${gameState.highScore || 0}`, 160, 34);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${gameState.waveName || "WAVE 1"}`, this.internalWidth / 2, 34);
      ctx.fillStyle = "#e74c3c";
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = "right";
      let livesText = "HP: ";
      for (let i = 0; i < (gameState.lives || 0); i++)
        livesText += "\u2665 ";
      ctx.fillText(livesText, this.internalWidth - 150, 34);
      ctx.textAlign = "right";
      ctx.fillStyle = gameState.timeLeft <= 5 ? "#e74c3c" : "#2ecc71";
      ctx.fillText(`TIME: ${gameState.timeLeft || 0}s`, this.internalWidth - 15, 34);
      const ammoY = this.internalHeight - 45;
      ctx.fillStyle = "rgba(26, 12, 2, 0.85)";
      ctx.fillRect(10, ammoY, 220, 36);
      ctx.strokeStyle = "#c85a17";
      ctx.strokeRect(10, ammoY, 220, 36);
      ctx.fillStyle = "#f39c12";
      for (let i = 0; i < gameState.clipSize; i++) {
        if (i < gameState.ammo) {
          ctx.fillRect(20 + i * 28, ammoY + 6, 14, 22);
        } else {
          ctx.strokeStyle = "#7f8c8d";
          ctx.strokeRect(20 + i * 28, ammoY + 6, 14, 22);
        }
      }
      if (gameState.isReloading) {
        ctx.fillStyle = "#e74c3c";
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText("RELOADING...", this.internalWidth / 2, this.internalHeight - 190);
      } else if (gameState.ammo === 0) {
        ctx.fillStyle = "#f1c40f";
        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText("PRESS SPACE OR TAP HERE TO RELOAD!", this.internalWidth / 2, this.internalHeight - 190);
      }
      ctx.fillStyle = "rgba(192, 57, 43, 0.85)";
      ctx.fillRect(this.internalWidth - 160, this.internalHeight - 60, 150, 50);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(this.internalWidth - 160, this.internalHeight - 60, 150, 50);
      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("RELOAD \u27F3", this.internalWidth - 85, this.internalHeight - 28);
    }
  };

  // src/input.js
  var InputManager = class {
    constructor(canvas, internalWidth, internalHeight, callbacks) {
      this.canvas = canvas;
      this.internalWidth = internalWidth;
      this.internalHeight = internalHeight;
      this.callbacks = callbacks;
      this.mouseX = internalWidth / 2;
      this.mouseY = internalHeight / 2;
      this.initEvents();
    }
    getScaledCoords(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.internalWidth / rect.width;
      const scaleY = this.internalHeight / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      return { x, y };
    }
    initEvents() {
      window.addEventListener("mousemove", (e) => {
        const { x, y } = this.getScaledCoords(e.clientX, e.clientY);
        this.mouseX = x;
        this.mouseY = y;
        if (this.callbacks.onMove)
          this.callbacks.onMove(x, y);
      });
      this.canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const { x, y } = this.getScaledCoords(e.clientX, e.clientY);
        if (x >= this.internalWidth - 160 && y >= this.internalHeight - 60) {
          if (this.callbacks.onReload)
            this.callbacks.onReload();
        } else {
          if (this.callbacks.onShoot)
            this.callbacks.onShoot(x, y);
        }
      });
      this.canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          const { x, y } = this.getScaledCoords(touch.clientX, touch.clientY);
          this.mouseX = x;
          this.mouseY = y;
          if (x >= this.internalWidth - 160 && y >= this.internalHeight - 60) {
            if (this.callbacks.onReload)
              this.callbacks.onReload();
          } else {
            if (this.callbacks.onShoot)
              this.callbacks.onShoot(x, y);
          }
        }
      }, { passive: false });
      window.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.key === " ") {
          e.preventDefault();
          if (this.callbacks.onReload)
            this.callbacks.onReload();
        }
      });
    }
  };

  // src/audio.js
  var SoundEffects = class {
    constructor() {
      this.ctx = null;
    }
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }
    playGunshot() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1e3, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.25);
    }
    playDryFire() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    }
    playReload() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const clickTime = now + i * 0.12;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1200 + i * 200, clickTime);
        gain.gain.setValueAtTime(0.4, clickTime);
        gain.gain.exponentialRampToValueAtTime(0.01, clickTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(clickTime);
        osc.stop(clickTime + 0.08);
      }
    }
    playHitOutlaw() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }
    playHitCivilian() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.1);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    playHurt() {
      this.init();
      if (!this.ctx)
        return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  };

  // src/main.js
  var Game = class {
    constructor() {
      this.canvas = document.getElementById("game-canvas");
      this.renderer = new Renderer(this.canvas);
      this.sfx = new SoundEffects();
      this.state = "START_SCREEN";
      this.config = null;
      this.currentWaveIndex = 0;
      this.score = 0;
      this.highScore = parseInt(localStorage.getItem("lightgun_highscore") || "0", 10);
      this.lives = 3;
      this.ammo = 6;
      this.clipSize = 6;
      this.isReloading = false;
      this.crosshairX = 512;
      this.crosshairY = 384;
      this.activeTargets = [];
      this.bulletHoles = [];
      this.recoilOffset = 0;
      this.muzzleFlashTimer = 0;
      this.lastTime = performance.now();
      this.spawnTimer = 0;
      this.waveTimeLeft = 30;
      this.secondAccumulator = 0;
      this.input = new InputManager(this.canvas, 1024, 768, {
        onMove: (x, y) => this.handleMove(x, y),
        onShoot: (x, y) => this.handleShoot(x, y),
        onReload: () => this.handleReload()
      });
    }
    async init() {
      this.config = await loadConfig();
      this.clipSize = this.config.game.clip_size || 6;
      this.ammo = this.clipSize;
      this.lives = this.config.game.starting_lives || 3;
      this.registerServiceWorker();
      requestAnimationFrame((t) => this.loop(t));
    }
    registerServiceWorker() {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").then(() => console.log("ServiceWorker registered for offline play")).catch((err) => console.log("ServiceWorker registration failed:", err));
      }
    }
    startNewGame() {
      this.score = 0;
      this.lives = this.config.game.starting_lives || 3;
      this.currentWaveIndex = 0;
      this.startWave(0);
    }
    startWave(waveIdx) {
      this.currentWaveIndex = waveIdx;
      const wave = this.config.waves[waveIdx] || this.config.waves[0];
      this.waveTimeLeft = wave.duration_sec || 30;
      this.secondAccumulator = 0;
      this.spawnTimer = 0;
      this.ammo = this.clipSize;
      this.isReloading = false;
      this.activeTargets = [];
      this.bulletHoles = [];
      this.state = "PLAYING";
    }
    handleMove(x, y) {
      this.crosshairX = x;
      this.crosshairY = y;
    }
    handleShoot(x, y) {
      if (this.state === "START_SCREEN" || this.state === "GAME_OVER" || this.state === "WAVE_CLEAR") {
        if (this.state === "GAME_OVER" || this.state === "START_SCREEN") {
          this.startNewGame();
        } else if (this.state === "WAVE_CLEAR") {
          this.startWave(this.currentWaveIndex + 1);
        }
        return;
      }
      if (this.state !== "PLAYING")
        return;
      if (this.isReloading) {
        this.sfx.playDryFire();
        return;
      }
      if (this.ammo <= 0) {
        this.sfx.playDryFire();
        return;
      }
      this.ammo--;
      this.sfx.playGunshot();
      this.recoilOffset = this.config.mechanics.recoil_distance_px || 18;
      this.muzzleFlashTimer = this.config.mechanics.muzzle_flash_ms || 70;
      this.bulletHoles.push({
        x,
        y,
        spawnTime: performance.now()
      });
      let hitSomething = false;
      for (let i = this.activeTargets.length - 1; i >= 0; i--) {
        const target = this.activeTargets[i];
        if (x >= target.x && x <= target.x + target.width && y >= target.y && y <= target.y + target.height) {
          hitSomething = true;
          const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];
          if (target.type === "outlaw" || target.type === "fast_outlaw") {
            const bonus = target.type === "fast_outlaw" ? 50 : 0;
            this.score += (wave.points_outlaw || 100) + bonus;
            if (this.score > this.highScore) {
              this.highScore = this.score;
              localStorage.setItem("lightgun_highscore", this.highScore.toString());
            }
            this.sfx.playHitOutlaw();
          } else if (target.type === "civilian") {
            this.score = Math.max(0, this.score - (wave.points_civilian_penalty || 200));
            this.sfx.playHitCivilian();
          }
          this.activeTargets.splice(i, 1);
          break;
        }
      }
    }
    handleReload() {
      if (this.state !== "PLAYING" || this.isReloading || this.ammo === this.clipSize)
        return;
      this.isReloading = true;
      this.sfx.playReload();
      setTimeout(() => {
        this.ammo = this.clipSize;
        this.isReloading = false;
      }, 400);
    }
    spawnTarget() {
      if (this.activeTargets.length >= 3)
        return;
      const covers = this.config.covers || [];
      const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];
      const occupiedCovers = new Set(this.activeTargets.map((t) => t.coverId));
      const availableCovers = covers.filter((c) => !occupiedCovers.has(c.id));
      if (availableCovers.length === 0)
        return;
      const selectedCover = availableCovers[Math.floor(Math.random() * availableCovers.length)];
      const isOutlaw = Math.random() < (wave.outlaw_ratio || 0.75);
      let type = "civilian";
      if (isOutlaw) {
        type = Math.random() < 0.3 ? "fast_outlaw" : "outlaw";
      }
      this.activeTargets.push({
        coverId: selectedCover.id,
        x: selectedCover.x,
        y: selectedCover.y,
        width: selectedCover.width,
        height: selectedCover.height,
        type,
        timer: wave.target_visible_duration_ms || 2e3,
        animTimer: 0,
        animDuration: 150
      });
    }
    update(dt) {
      if (this.recoilOffset > 0) {
        this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.15);
      }
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      }
      const now = performance.now();
      const maxHoleAge = this.config.mechanics.bullet_hole_duration_ms || 5e3;
      this.bulletHoles = this.bulletHoles.filter((h) => now - h.spawnTime < maxHoleAge);
      if (this.state !== "PLAYING")
        return;
      const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];
      this.secondAccumulator += dt;
      if (this.secondAccumulator >= 1e3) {
        this.secondAccumulator -= 1e3;
        this.waveTimeLeft--;
        if (this.waveTimeLeft <= 0) {
          if (this.currentWaveIndex + 1 < this.config.waves.length) {
            this.state = "WAVE_CLEAR";
          } else {
            this.state = "WAVE_CLEAR";
          }
        }
      }
      this.spawnTimer += dt;
      if (this.spawnTimer >= wave.spawn_interval_ms) {
        this.spawnTimer = 0;
        this.spawnTarget();
      }
      for (let i = this.activeTargets.length - 1; i >= 0; i--) {
        const target = this.activeTargets[i];
        target.animTimer += dt;
        target.timer -= dt;
        if (target.timer <= 0) {
          if (target.type === "outlaw" || target.type === "fast_outlaw") {
            this.lives--;
            this.sfx.playHurt();
            if (this.lives <= 0) {
              this.state = "GAME_OVER";
            }
          }
          this.activeTargets.splice(i, 1);
        }
      }
    }
    renderOverlayScreens() {
      const ctx = this.renderer.ctx;
      if (this.state === "START_SCREEN") {
        ctx.fillStyle = "rgba(13, 6, 3, 0.85)";
        ctx.fillRect(0, 0, 1024, 768);
        ctx.fillStyle = "#f1c40f";
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText("WILD WEST LIGHT GUN ARCADE", 512, 280);
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.fillText("AIM & SHOOT OUTLAWS | SPARE CIVILIANS", 512, 360);
        ctx.fillText("SPACE OR ON-SCREEN BUTTON TO RELOAD", 512, 400);
        ctx.fillStyle = "#e74c3c";
        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.fillText("CLICK / TAP TO START GAME", 512, 500);
      } else if (this.state === "WAVE_CLEAR") {
        ctx.fillStyle = "rgba(13, 6, 3, 0.85)";
        ctx.fillRect(0, 0, 1024, 768);
        ctx.fillStyle = "#2ecc71";
        ctx.font = 'bold 42px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText("WAVE CLEARED!", 512, 300);
        ctx.fillStyle = "#f1c40f";
        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.fillText(`CURRENT SCORE: ${this.score}`, 512, 380);
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.fillText("CLICK / TAP FOR NEXT WAVE", 512, 480);
      } else if (this.state === "GAME_OVER") {
        ctx.fillStyle = "rgba(13, 6, 3, 0.88)";
        ctx.fillRect(0, 0, 1024, 768);
        ctx.fillStyle = "#e74c3c";
        ctx.font = 'bold 48px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", 512, 280);
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillText(`FINAL SCORE: ${this.score}`, 512, 360);
        ctx.fillText(`HIGH SCORE: ${this.highScore}`, 512, 400);
        ctx.fillStyle = "#f1c40f";
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillText("CLICK / TAP TO RESTART", 512, 500);
      }
    }
    loop(timestamp) {
      const dt = timestamp - this.lastTime;
      this.lastTime = timestamp;
      const wave = this.config ? this.config.waves[this.currentWaveIndex] || this.config.waves[0] : null;
      this.update(dt);
      this.renderer.render({
        score: this.score,
        highScore: this.highScore,
        lives: this.lives,
        ammo: this.ammo,
        clipSize: this.clipSize,
        isReloading: this.isReloading,
        waveName: wave ? wave.name : "Wave 1",
        timeLeft: this.waveTimeLeft,
        crosshairX: this.crosshairX,
        crosshairY: this.crosshairY,
        activeTargets: this.activeTargets,
        bulletHoles: this.bulletHoles,
        recoilOffset: this.recoilOffset,
        muzzleFlashTimer: this.muzzleFlashTimer
      });
      this.renderOverlayScreens();
      requestAnimationFrame((t) => this.loop(t));
    }
  };
  window.addEventListener("DOMContentLoaded", () => {
    const game = new Game();
    game.init();
  });
})();
/*! Bundled license information:

smol-toml/dist/date.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/error.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/util.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/primitive.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/extract.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/struct.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/parse.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/stringify.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)

smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
//# sourceMappingURL=bundle.js.map

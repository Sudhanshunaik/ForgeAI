'use strict';

/* =========================================================================
 * Calculator engine
 * ---------------------------------------------------------------------------
 * The engine is deliberately DOM-free and pure where it counts:
 *   - compute(a, op, b)  -> plain number (NaN signals an invalid result)
 *   - formatNumber(n)    -> display string ("Error" for non-finite values)
 *   - Calculator         -> state machine driving the UI
 *
 * The page and the test suite drive the *same* Calculator methods, so a green
 * test means the real code path was exercised.
 *
 * Chained operations use classic immediate execution (left-to-right), the
 * behaviour of hardware and phone calculators:  2 + 3 x 4 = 20, because the
 * pending operation is resolved as soon as the next operator is pressed.
 * ========================================================================= */

/** Pending operators are stored normalised; only '*' and '/' are used internally. */
const OPERATORS = ['+', '-', '*', '/'];

/**
 * Apply one arithmetic operation.
 * @returns {number} the result, or NaN when the operation is undefined
 *                   (division by zero, unsupported operator).
 */
function compute(a, operator, b) {
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? NaN : a / b;
    default:
      return NaN;
  }
}

/**
 * Turn a raw number into the string shown on the display. Rounds to 12
 * significant digits so binary floating-point noise (0.1 + 0.2) never leaks
 * into the UI, then trims redundant trailing zeros.
 * @returns {string} "Error" for NaN / Infinity / non-numbers.
 */
function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Error';
  }
  const rounded = Number(value.toPrecision(12));
  // -0 would otherwise print as "-0".
  if (Object.is(rounded, -0)) {
    return '0';
  }
  return String(rounded);
}

/** Normalise the many ways a user can type an operator. */
function normalizeOperator(raw) {
  if (raw === 'x' || raw === 'X' || raw === '\u00d7') return '*';
  if (raw === '\u00f7') return '/';
  if (raw === '\u2212') return '-';
  return OPERATORS.indexOf(raw) === -1 ? null : raw;
}

function Calculator() {
  this.reset();
}

/** Full reset — this is what AC does. */
Calculator.prototype.reset = function reset() {
  this.accumulator = null; // left-hand operand waiting for an operator
  this.operator = null; // pending operator (normalised) or null
  this.entry = null; // digits currently being typed, or null
  this.display = '0';
  this.error = false;
};

Calculator.prototype.getDisplay = function getDisplay() {
  return this.display;
};

Calculator.prototype.isError = function isError() {
  return this.error;
};

/** Internal: park the engine in its "Error" state (division by zero). */
Calculator.prototype.setError = function setError() {
  this.accumulator = null;
  this.operator = null;
  this.entry = null;
  this.display = 'Error';
  this.error = true;
};

Calculator.prototype.inputDigit = function inputDigit(digit) {
  if (!/^[0-9]$/.test(digit)) return;
  if (this.error) this.reset();

  if (this.entry === null) {
    this.entry = digit;
  } else if (this.entry === '0') {
    this.entry = digit; // replace a leading zero instead of "07"
  } else if (this.entry === '-0') {
    this.entry = '-' + digit;
  } else {
    this.entry += digit;
  }
  this.display = this.entry;
};

Calculator.prototype.inputDecimal = function inputDecimal() {
  if (this.error) this.reset();

  if (this.entry === null) {
    this.entry = '0.';
  } else if (this.entry.indexOf('.') !== -1) {
    return; // one decimal point per number
  } else {
    this.entry += '.';
  }
  this.display = this.entry;
};

Calculator.prototype.inputOperator = function inputOperator(rawOperator) {
  const operator = normalizeOperator(rawOperator);
  if (operator === null || this.error) return;

  if (this.entry !== null) {
    const typed = parseFloat(this.entry);
    if (this.accumulator === null || this.operator === null) {
      this.accumulator = typed;
    } else {
      const result = compute(this.accumulator, this.operator, typed);
      if (!Number.isFinite(result)) {
        this.setError();
        return;
      }
      this.accumulator = result;
    }
    this.entry = null;
  } else if (this.accumulator === null) {
    // Operator pressed before any number: use whatever is on screen.
    const shown = parseFloat(this.display);
    this.accumulator = Number.isFinite(shown) ? shown : 0;
  }
  // Otherwise an operator was pressed twice in a row: just swap the operator.

  this.operator = operator;
  this.display = formatNumber(this.accumulator);
};

Calculator.prototype.equals = function equals() {
  if (this.error) return;

  if (this.operator === null || this.accumulator === null) {
    // Nothing pending — just settle a half-typed number.
    if (this.entry !== null) {
      this.display = formatNumber(parseFloat(this.entry));
      this.entry = null;
    }
    return;
  }

  // No right-hand operand typed (e.g. "2 + ="): reuse the accumulator.
  const typed = this.entry !== null ? parseFloat(this.entry) : this.accumulator;
  const result = compute(this.accumulator, this.operator, typed);
  if (!Number.isFinite(result)) {
    this.setError();
    return;
  }

  this.display = formatNumber(result);
  this.accumulator = result;
  this.operator = null;
  this.entry = null;
};

Calculator.prototype.clear = function clear() {
  this.reset();
};

Calculator.prototype.backspace = function backspace() {
  if (this.error) {
    this.reset();
    return;
  }
  if (this.entry === null) {
    return; // nothing being typed — leave the settled result alone
  }

  this.entry = this.entry.slice(0, -1);
  if (this.entry === '' || this.entry === '-') {
    this.entry = null;
    this.display = '0';
  } else {
    this.display = this.entry;
  }
};

Calculator.prototype.toggleSign = function toggleSign() {
  if (this.error) return;

  if (this.entry !== null) {
    this.entry = this.entry.charAt(0) === '-' ? this.entry.slice(1) : '-' + this.entry;
    this.display = this.entry;
  } else if (this.accumulator !== null) {
    this.accumulator = -this.accumulator;
    this.display = formatNumber(this.accumulator);
  } else {
    // Fresh zero: keep the sign as a pending entry so the next digit typed is
    // negative ("-0" then "7" -> "-7", see inputDigit). Negating only the
    // display would be undone by formatNumber's -0 normalisation.
    this.entry = '-0';
    this.display = this.entry;
  }
};

/* =========================================================================
 * Browser wiring — skipped entirely when the file is imported by Node.
 * ========================================================================= */

if (typeof document !== 'undefined') {
  (function bindPage() {
    const calculator = new Calculator();
    const displayEl = document.getElementById('display');
    const keysEl = document.getElementById('keys');

    function render() {
      const value = calculator.getDisplay();
      displayEl.textContent = value;
      displayEl.classList.toggle('is-error', calculator.isError());
      displayEl.classList.toggle('is-long', value.length > 11);
      displayEl.scrollLeft = displayEl.scrollWidth;
    }

    /* --- Pointer / touch input (event delegation, no inline handlers) --- */
    keysEl.addEventListener('click', function onClick(event) {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.digit !== undefined) {
        calculator.inputDigit(button.dataset.digit);
      } else if (button.dataset.op !== undefined) {
        calculator.inputOperator(button.dataset.op);
      } else {
        switch (button.dataset.action) {
          case 'decimal':
            calculator.inputDecimal();
            break;
          case 'equals':
            calculator.equals();
            break;
          case 'clear':
            calculator.clear();
            break;
          case 'backspace':
            calculator.backspace();
            break;
          case 'sign':
            calculator.toggleSign();
            break;
          default:
            return;
        }
      }
      render();
    });

    /* --- Keyboard input --- */
    document.addEventListener('keydown', function onKeydown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;
      const lower = key.toLowerCase();

      if (/^[0-9]$/.test(key)) {
        calculator.inputDigit(key);
      } else if (key === '.' || key === ',') {
        calculator.inputDecimal();
      } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        calculator.inputOperator(key);
      } else if (lower === 'x') {
        calculator.inputOperator('*');
      } else if (key === 'Enter' || key === '=') {
        calculator.equals();
      } else if (key === 'Escape' || lower === 'c') {
        calculator.clear();
      } else if (key === 'Backspace') {
        calculator.backspace();
      } else {
        return;
      }

      event.preventDefault();
      render();
    });

    render();
  })();
}

/* Exported for the test suite; harmless in the browser (`module` is undefined). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Calculator, compute, formatNumber, normalizeOperator, OPERATORS };
}

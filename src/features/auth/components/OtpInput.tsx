'use client';

import React, { useCallback, useEffect, useRef } from 'react';

type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (value: string) => void;
  ariaLabel?: string;
  /** Extra classes for the wrapper row. */
  className?: string;
  /** Extra classes per input box. */
  inputClassName?: string;
};

/**
 * Accessible segmented one-time-password input.
 *
 * Features:
 * - One digit per visual input.
 * - Numeric keyboard on mobile.
 * - Optional autofocus.
 * - Full OTP paste support.
 * - OTP autofill support.
 * - Backspace navigation.
 * - Arrow-key navigation.
 * - Delete support.
 * - Controlled value.
 * - onComplete fires only when the completed value changes.
 *
 * The component always exposes a digits-only value capped at `length`.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled = false,
  onComplete,
  ariaLabel = 'One-time verification code',
  className = '',
  inputClassName = '',
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const lastCompletedValueRef = useRef('');

  /**
   * Keep the value normalized even if a parent accidentally provides
   * non-numeric characters.
   */
  const digitValue = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, length);

  /**
   * Keep refs in sync if the OTP length changes.
   */
  useEffect(() => {
    refs.current = refs.current.slice(0, length);
  }, [length]);

  /**
   * Reset completion tracking when the OTP becomes incomplete.
   *
   * This allows the same code to trigger onComplete again after
   * the user clears and re-enters it.
   */
  useEffect(() => {
    if (digitValue.length < length) {
      lastCompletedValueRef.current = '';
    }
  }, [digitValue, length]);

  /**
   * Autofocus only once when enabled.
   */
  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const timerId = window.setTimeout(() => {
      refs.current[0]?.focus({ preventScroll: true });
    }, 60);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [autoFocus, disabled]);

  const focusIndex = useCallback(
    (index: number, select = true) => {
      const clamped = Math.max(
        0,
        Math.min(length - 1, index),
      );

      const input = refs.current[clamped];

      if (!input || input.disabled) {
        return;
      }

      input.focus({ preventScroll: true });

      if (select) {
        input.select();
      }
    },
    [length],
  );

  const emitChange = useCallback(
    (next: string) => {
      const normalized = next
        .replace(/\D/g, '')
        .slice(0, length);

      onChange(normalized);

      if (
        normalized.length === length &&
        normalized !== lastCompletedValueRef.current
      ) {
        lastCompletedValueRef.current = normalized;
        onComplete?.(normalized);
      }
    },
    [length, onChange, onComplete],
  );

  /**
   * Insert digits starting at a particular box.
   *
   * Example:
   *
   * value = "12"
   * index = 2
   * incoming = "3456"
   *
   * result = "123456"
   */
  const insertAt = useCallback(
    (index: number, incoming: string) => {
      const digits = incoming
        .replace(/\D/g, '')
        .slice(0, length);

      if (!digits) {
        return;
      }

      const chars = digitValue.split('');

      for (let offset = 0; offset < digits.length; offset += 1) {
        const targetIndex = index + offset;

        if (targetIndex >= length) {
          break;
        }

        chars[targetIndex] = digits[offset];
      }

      const next = chars.join('').slice(0, length);

      emitChange(next);

      const nextIndex = Math.min(
        index + digits.length,
        length - 1,
      );

      if (next.length < length) {
        focusIndex(nextIndex);
      }
    },
    [digitValue, emitChange, focusIndex, length],
  );

  const handleChange = (
    index: number,
    raw: string,
  ) => {
    const incoming = raw.replace(/\D/g, '');

    if (!incoming) {
      /**
       * Some browsers fire onChange with an empty value when
       * select-all + delete is used.
       */
      const chars = digitValue.split('');

      chars[index] = '';

      emitChange(chars.join(''));

      focusIndex(index);

      return;
    }

    /**
     * Handles:
     * - normal single digit input
     * - mobile OTP autofill
     * - browser paste-like input
     */
    insertAt(index, incoming);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    switch (event.key) {
      case 'Backspace': {
        event.preventDefault();

        const chars = digitValue.split('');

        if (chars[index]) {
          /**
           * Clear current digit first.
           */
          chars[index] = '';

          emitChange(chars.join(''));
          focusIndex(index);

          return;
        }

        /**
         * Current box is already empty.
         * Move to previous box and clear it.
         */
        if (index > 0) {
          chars[index - 1] = '';

          emitChange(chars.join(''));
          focusIndex(index - 1);
        }

        return;
      }

      case 'Delete': {
        event.preventDefault();

        const chars = digitValue.split('');

        chars[index] = '';

        emitChange(chars.join(''));
        focusIndex(index);

        return;
      }

      case 'ArrowLeft': {
        event.preventDefault();

        if (index > 0) {
          focusIndex(index - 1);
        }

        return;
      }

      case 'ArrowRight': {
        event.preventDefault();

        if (index < length - 1) {
          focusIndex(index + 1);
        }

        return;
      }

      case 'Home': {
        event.preventDefault();
        focusIndex(0);
        return;
      }

      case 'End': {
        event.preventDefault();
        focusIndex(length - 1);
        return;
      }

      default:
        break;
    }
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    event.preventDefault();

    const pasted = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, length);

    if (!pasted) {
      return;
    }

    /**
     * For a full OTP, replace the whole value.
     *
     * This is the expected behavior when the user copies:
     * 123456
     *
     * into any OTP box.
     */
    if (pasted.length >= length) {
      emitChange(pasted.slice(0, length));
      focusIndex(length - 1);

      return;
    }

    /**
     * For a partial paste, insert starting from the
     * currently focused box.
     */
    insertAt(
      Number(
        (event.currentTarget.dataset.index ?? '0'),
      ),
      pasted,
    );
  };

  const handleFocus = (
    event: React.FocusEvent<HTMLInputElement>,
  ) => {
    /**
     * Selecting the current value makes replacement easy
     * on desktop and mobile.
     */
    event.currentTarget.select();
  };

  /**
   * If an invalid length somehow reaches the component,
   * avoid rendering an unusable input group.
   */
  if (length < 1) {
    return null;
  }

  return (
    <div
      className={[
        'flex items-center justify-center gap-2 sm:gap-3',
        className,
      ].join(' ')}
      role="group"
      aria-label={ariaLabel}
    >
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(digitValue[index]);
        const digit = digitValue[index] ?? '';

        return (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            data-index={index}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            /**
             * Each visual box represents exactly one digit.
             *
             * IMPORTANT:
             * The previous implementation used `maxLength={length}`
             * here. That allows multiple characters in one box.
             */
            maxLength={1}
            autoComplete={
              index === 0
                ? 'one-time-code'
                : 'off'
            }
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-posinset={index + 1}
            aria-setsize={length}
            value={digit}
            onChange={(event) =>
              handleChange(
                index,
                event.target.value,
              )
            }
            onKeyDown={(event) =>
              handleKeyDown(index, event)
            }
            onPaste={handlePaste}
            onFocus={handleFocus}
            className={[
              'h-12 w-10 rounded-xl border',
              'bg-white text-center text-lg font-bold',
              'tracking-widest text-slate-900 outline-none',
              'transition',
              'focus:border-sky-400',
              'focus:ring-4 focus:ring-sky-100',
              'disabled:cursor-not-allowed',
              'disabled:opacity-60',
              'sm:w-12 sm:text-xl',
              filled
                ? 'border-sky-400 bg-sky-50/60'
                : 'border-slate-200',
              inputClassName,
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

export default OtpInput;
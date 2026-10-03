'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Check, Loader2, X } from 'lucide-react';

export type OtpStatus = 'idle' | 'verifying' | 'success' | 'error';

type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (value: string) => void;
  ariaLabel?: string;
  /** Drives the typing -> verifying -> success feedback states. */
  status?: OtpStatus;
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
 * - typing -> verifying -> success status states.
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
  status = 'idle',
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

  /**
   * After a rejected code the parent clears the value while this component
   * stays mounted, so the first cell is refocused and the user can simply type
   * the next attempt.
   */
  const previousValueRef = useRef(value);

  useEffect(() => {
    const wasFilled = previousValueRef.current.length > 0;
    previousValueRef.current = value;

    if (wasFilled && value.length === 0 && !disabled) {
      const timerId = window.setTimeout(() => {
        refs.current[0]?.focus({ preventScroll: true });
      }, 0);

      return () => window.clearTimeout(timerId);
    }
  }, [value, disabled]);

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
        // Fluid so all boxes always fit, down to 320px-wide screens.
        'flex w-full items-center justify-center gap-1.5 sm:gap-2.5',
        className,
      ].join(' ')}
      role="group"
      aria-label={ariaLabel}
      aria-busy={status === 'verifying'}
    >
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(digitValue[index]);
        const digit = digitValue[index] ?? '';

        /**
         * Status tones take priority over the "filled" hint so a wrong code
         * reads as a mistake rather than as normal progress.
         */
        const toneClass =
          status === 'success'
            ? 'bg-[#d7f8e6]'
            : status === 'error'
              ? 'bg-[#ffdad6]'
              : status === 'verifying'
                ? 'bg-[#e3ebe7]'
                : filled
                  ? 'bg-[#e3ebe7]'
                  : 'bg-[#f2f6f4]';

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
              // flex-1 + max-width keeps 6 boxes inside the narrowest phones
              // while still landing on the 44-48px target from the spec.
              'h-[3.25rem] w-full min-w-0 max-w-[44px] flex-1 rounded-xl',
              'text-center text-2xl font-bold',
              'text-[#131b2e] outline-none',
              'shadow-sm transition-colors',
              'focus:bg-white',
              'disabled:cursor-not-allowed',
              'disabled:opacity-60',
              'sm:h-14 sm:max-w-[48px]',
              toneClass,
              inputClassName,
            ].join(' ')}
          />
        );
      })}

      <span aria-live="polite" className="sr-only">
        {status === 'verifying'
          ? 'Verifying code'
          : status === 'success'
            ? 'Code verified'
            : status === 'error'
              ? 'Code rejected'
              : ''}
      </span>
    </div>
  );
}

/**
 * Small status line rendered under the boxes while the code is being checked.
 */
export function OtpStatusLine({ status, className = '' }: { status: OtpStatus; className?: string }) {
  if (status === 'idle') return null;

  const config = {
    verifying: { icon: Loader2, text: 'Verifying code...', tone: 'text-slate-500' },
    success: { icon: Check, text: 'Code verified', tone: 'text-emerald-600' },
    error: { icon: X, text: 'Incorrect verification code. Please try again.', tone: 'text-rose-600' },
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <p className={['mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-semibold', config.tone, className].join(' ')}>
      <Icon size={14} className={status === 'verifying' ? 'animate-spin' : undefined} />
      {config.text}
    </p>
  );
}

export default OtpInput;

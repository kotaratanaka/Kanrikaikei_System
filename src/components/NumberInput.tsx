import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, className, placeholder, readOnly }) => {
  const [localVal, setLocalVal] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  
  // Cursor management
  const cursorRef = useRef<number | null>(null);

  // Sync with external value when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(value === 0 ? '' : value.toLocaleString());
    }
  }, [value, isFocused]);

  useLayoutEffect(() => {
    if (cursorRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      cursorRef.current = null;
    }
  }, [localVal]);

  const processInput = (rawVal: string, selectionStart: number | null) => {
    // 1. Digits before cursor strategy
    let digitsBeforeCursor = 0;
    const effectiveSelectionStart = selectionStart || 0;
    
    // Count only numeric characters up to the cursor
    for (let i = 0; i < effectiveSelectionStart; i++) {
        if (/[0-9]/.test(rawVal[i])) digitsBeforeCursor++;
    }

    // 2. Sanitize: Remove anything that is NOT a half-width digit
    // The user requested "Half-width only". We strip full-width and other chars.
    let cleanDigits = rawVal.replace(/[^0-9]/g, '');
    
    // 3. Format with commas
    // Regex to add commas. Supports "0,000" style if leading zeros exist in string
    const formatted = cleanDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // 4. Calculate new cursor position
    let newCursorPos = 0;
    let digitsSeen = 0;
    
    // Scan formatted string to find where `digitsBeforeCursor` ends
    for (let i = 0; i < formatted.length; i++) {
        if (/[0-9]/.test(formatted[i])) {
            digitsSeen++;
        }
        
        // If we found the target digit count
        if (digitsSeen === digitsBeforeCursor) {
             newCursorPos = i + 1;
             break;
        }
    }

    // Edge cases
    if (digitsBeforeCursor === 0) newCursorPos = 0;
    if (digitsSeen < digitsBeforeCursor) newCursorPos = formatted.length;

    // Save state
    cursorRef.current = newCursorPos;
    setLocalVal(formatted);

    // Update parent
    const numVal = cleanDigits === '' ? 0 : Number(cleanDigits);
    // Prevent update loop if value is same
    if (numVal !== value) {
        onChange(numVal);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // During IME composition, just update local state to allow input to appear temporarily
    if (isComposing.current) {
        setLocalVal(e.target.value);
        return;
    }
    
    processInput(e.target.value, e.target.selectionStart);
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposing.current = false;
    // Force process input after composition ends (e.g. converting full-width to nothing/half-width)
    // Here we strip it because requirements say "Only half-width allowed".
    const input = e.currentTarget;
    processInput(input.value, input.selectionStart);
  };

  const handleFocus = () => {
    if (!readOnly) {
        setIsFocused(true);
        if (value === 0 && localVal === '') {
            setLocalVal('');
        } else if (value !== 0) {
            setLocalVal(value.toLocaleString());
        }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setLocalVal(value === 0 ? '' : value.toLocaleString());
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={localVal}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder || "0"}
      readOnly={readOnly}
      inputMode="numeric"
      style={{ imeMode: 'disabled' } as any} // Legacy hint for some browsers
    />
  );
};

import { useState, useRef, useCallback } from 'react'
import { hashPin } from './PinLock'

interface CalculatorProps {
  onExit: () => void
  pinHash: string
}

export default function Calculator({ onExit, pinHash }: CalculatorProps) {
  const [display, setDisplay] = useState('0')
  const [prevValue, setPrevValue] = useState<number | null>(null)
  const [operator, setOperator] = useState<string | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)

  // Track digit presses for exit code detection
  const digitBuffer = useRef('')
  const checkingRef = useRef(false)

  const checkExitCode = useCallback(async (buffer: string) => {
    if (buffer.length < 4 || checkingRef.current) return
    checkingRef.current = true
    // Try the last 4-8 digits as a PIN
    for (let len = 4; len <= Math.min(8, buffer.length); len++) {
      const candidate = buffer.slice(-len)
      const hash = await hashPin(candidate)
      if (hash === pinHash) {
        onExit()
        checkingRef.current = false
        return
      }
    }
    checkingRef.current = false
  }, [pinHash, onExit])

  function inputDigit(digit: string) {
    if (waitingForOperand) {
      setDisplay(digit)
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? digit : display + digit)
    }
    digitBuffer.current += digit
  }

  function inputDot() {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }
    if (!display.includes('.')) {
      setDisplay(display + '.')
    }
  }

  function clear() {
    setDisplay('0')
    setPrevValue(null)
    setOperator(null)
    setWaitingForOperand(false)
    digitBuffer.current = ''
  }

  function toggleSign() {
    const val = parseFloat(display)
    if (val !== 0) {
      setDisplay(String(-val))
    }
  }

  function inputPercent() {
    const val = parseFloat(display)
    setDisplay(String(val / 100))
  }

  function performOperation(nextOp: string) {
    const current = parseFloat(display)

    if (prevValue !== null && operator && !waitingForOperand) {
      let result: number
      switch (operator) {
        case '+': result = prevValue + current; break
        case '-': result = prevValue - current; break
        case '*': result = prevValue * current; break
        case '/': result = current !== 0 ? prevValue / current : 0; break
        default: result = current
      }
      setDisplay(String(result))
      setPrevValue(result)
    } else {
      setPrevValue(current)
    }

    setOperator(nextOp)
    setWaitingForOperand(true)
  }

  function handleEquals() {
    const current = parseFloat(display)
    if (prevValue !== null && operator) {
      let result: number
      switch (operator) {
        case '+': result = prevValue + current; break
        case '-': result = prevValue - current; break
        case '*': result = prevValue * current; break
        case '/': result = current !== 0 ? prevValue / current : 0; break
        default: result = current
      }
      setDisplay(String(result))
      setPrevValue(null)
      setOperator(null)
      setWaitingForOperand(true)
    }
    // Check exit code on = press
    checkExitCode(digitBuffer.current)
  }

  // Format display value
  const displayValue = (() => {
    const num = parseFloat(display)
    if (display.endsWith('.') || display.endsWith('.0')) return display
    if (isNaN(num)) return '0'
    if (Number.isInteger(num) && !display.includes('.')) {
      return num.toLocaleString('en-US')
    }
    return num.toLocaleString('en-US', { maximumFractionDigits: 8 })
  })()

  const fontSize = displayValue.length > 9 ? '2rem' : displayValue.length > 6 ? '2.5rem' : '3.5rem'

  const btnStyle = {
    number: {
      backgroundColor: '#333',
      color: '#fff',
      fontSize: '1.5rem',
      fontWeight: 400 as const,
      border: 'none',
      borderRadius: '50%',
      width: '72px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    },
    operator: {
      backgroundColor: '#f59e0b',
      color: '#fff',
      fontSize: '1.75rem',
      fontWeight: 400 as const,
      border: 'none',
      borderRadius: '50%',
      width: '72px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    },
    function: {
      backgroundColor: '#a5a5a5',
      color: '#000',
      fontSize: '1.25rem',
      fontWeight: 400 as const,
      border: 'none',
      borderRadius: '50%',
      width: '72px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    },
    zero: {
      backgroundColor: '#333',
      color: '#fff',
      fontSize: '1.5rem',
      fontWeight: 400 as const,
      border: 'none',
      borderRadius: '36px',
      width: '152px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingLeft: '28px',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    },
  }

  const activeOp = (op: string) => operator === op && waitingForOperand
    ? { ...btnStyle.operator, backgroundColor: '#fff', color: '#f59e0b' }
    : btnStyle.operator

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Display */}
      <div
        style={{
          width: '100%',
          maxWidth: '340px',
          textAlign: 'right',
          padding: '0 20px',
          marginBottom: '8px',
          color: '#fff',
          fontSize,
          fontWeight: 300,
          lineHeight: 1.2,
          minHeight: '60px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          overflow: 'hidden',
        }}
      >
        {displayValue}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '340px', width: '100%', padding: '0 8px' }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={clear} style={btnStyle.function}>{display !== '0' ? 'C' : 'AC'}</button>
          <button onClick={toggleSign} style={btnStyle.function}>+/-</button>
          <button onClick={inputPercent} style={btnStyle.function}>%</button>
          <button onClick={() => performOperation('/')} style={activeOp('/')}>&divide;</button>
        </div>
        {/* Row 2 */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => inputDigit('7')} style={btnStyle.number}>7</button>
          <button onClick={() => inputDigit('8')} style={btnStyle.number}>8</button>
          <button onClick={() => inputDigit('9')} style={btnStyle.number}>9</button>
          <button onClick={() => performOperation('*')} style={activeOp('*')}>&times;</button>
        </div>
        {/* Row 3 */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => inputDigit('4')} style={btnStyle.number}>4</button>
          <button onClick={() => inputDigit('5')} style={btnStyle.number}>5</button>
          <button onClick={() => inputDigit('6')} style={btnStyle.number}>6</button>
          <button onClick={() => performOperation('-')} style={activeOp('-')}>&minus;</button>
        </div>
        {/* Row 4 */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => inputDigit('1')} style={btnStyle.number}>1</button>
          <button onClick={() => inputDigit('2')} style={btnStyle.number}>2</button>
          <button onClick={() => inputDigit('3')} style={btnStyle.number}>3</button>
          <button onClick={() => performOperation('+')} style={activeOp('+')}>+</button>
        </div>
        {/* Row 5 */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => inputDigit('0')} style={btnStyle.zero}>0</button>
          <button onClick={inputDot} style={btnStyle.number}>.</button>
          <button onClick={handleEquals} style={btnStyle.operator}>=</button>
        </div>
      </div>
    </div>
  )
}

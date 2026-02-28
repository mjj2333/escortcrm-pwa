import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { db, createTransaction } from '../../db'
import { Modal } from '../../components/Modal'
import { showToast } from '../../components/Toast'
import { SectionLabel, FieldCurrency, FieldSelect, FieldDate, FieldTextArea } from '../../components/FormFields'
import type { TransactionType, TransactionCategory, PaymentMethod } from '../../types'

const categories: TransactionCategory[] = ['booking', 'tip', 'gift', 'refund', 'supplies', 'travel', 'advertising', 'clothing', 'health', 'rent', 'phone', 'other']
const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface TransactionEditorProps {
  isOpen: boolean
  onClose: () => void
  initialType?: TransactionType
}

export function TransactionEditor({ isOpen, onClose, initialType }: TransactionEditorProps) {
  const [type, setType] = useState<TransactionType>(initialType ?? 'income')
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState<TransactionCategory>('booking')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setType(initialType ?? 'income')
      setAmount(0)
      setCategory(initialType === 'expense' ? 'supplies' : 'booking')
      setPaymentMethod('Cash')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setNotes('')
    }
  }, [isOpen, initialType])

  const isValid = amount > 0

  async function handleSave() {
    if (!isValid) return
    try {
      const txn = createTransaction({
        amount, type, category, paymentMethod,
        date: new Date(date + 'T00:00:00'),
        notes: notes.trim(),
      })
      await db.transactions.add(txn)
      showToast(type === 'expense' ? 'Expense recorded' : 'Income recorded')
      onClose()
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Transaction"
      actions={
        <button onClick={handleSave} disabled={!isValid}
          className={`p-2 ${isValid ? 'text-purple-500' : 'opacity-30'}`}>
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Type Toggle */}
        <div className="pt-2 pb-3">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid var(--border)' }}>
            <button type="button" onClick={() => setType('income')}
              className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors ${type === 'income' ? 'bg-green-600 text-white' : ''}`}
              style={type !== 'income' ? { color: 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' } : { WebkitTapHighlightColor: 'transparent' }}>
              Income
            </button>
            <button type="button" onClick={() => setType('expense')}
              className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors ${type === 'expense' ? 'bg-red-600 text-white' : ''}`}
              style={type !== 'expense' ? { color: 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' } : { WebkitTapHighlightColor: 'transparent' }}>
              Expense
            </button>
          </div>
        </div>

        <SectionLabel label="Details" />
        <FieldCurrency label="Amount" value={amount} onChange={setAmount} />
        <FieldSelect label="Category" value={category} options={categories} onChange={setCategory} displayFn={titleCase} />
        <FieldSelect label="Payment Method" value={paymentMethod} options={paymentMethods} onChange={setPaymentMethod} />
        <FieldDate label="Date" value={date} onChange={setDate} />

        <SectionLabel label="Notes" optional />
        <FieldTextArea label="Notes" value={notes} onChange={setNotes} placeholder="Optional notes..." />

        <div className="py-4">
          <button onClick={handleSave} disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}>
            Add {type === 'income' ? 'Income' : 'Expense'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}

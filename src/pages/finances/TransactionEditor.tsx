import { useState } from 'react'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { db, createTransaction } from '../../db'
import { Modal, FormSection, FormSelect, FormInput, FormCurrency } from '../../components/Modal'
import type { TransactionType, TransactionCategory, PaymentMethod } from '../../types'

const categories: TransactionCategory[] = ['booking', 'tip', 'gift', 'supplies', 'travel', 'advertising', 'clothing', 'health', 'rent', 'phone', 'other']
const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']

interface TransactionEditorProps {
  isOpen: boolean
  onClose: () => void
}

export function TransactionEditor({ isOpen, onClose }: TransactionEditorProps) {
  const [type, setType] = useState<TransactionType>('income')
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState<TransactionCategory>('booking')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')

  const isValid = amount > 0

  async function handleSave() {
    if (!isValid) return

    const txn = createTransaction({
      amount,
      type,
      category,
      paymentMethod,
      date: new Date(date),
      notes: notes.trim(),
    })
    await db.transactions.add(txn)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Transaction"
      actions={
        <button
          onClick={handleSave}
          disabled={!isValid}
          className={`p-1 ${isValid ? 'text-purple-500' : 'opacity-30'}`}
        >
          <Check size={20} />
        </button>
      }
    >
      <div style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Type Toggle */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setType('income')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                type === 'income' ? 'bg-green-600 text-white' : ''
              }`}
              style={type !== 'income' ? { color: 'var(--text-secondary)' } : {}}
            >
              Income
            </button>
            <button
              onClick={() => setType('expense')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                type === 'expense' ? 'bg-red-600 text-white' : ''
              }`}
              style={type !== 'expense' ? { color: 'var(--text-secondary)' } : {}}
            >
              Expense
            </button>
          </div>
        </div>

        <FormSection title="Details">
          <FormCurrency label="Amount" value={amount} onChange={setAmount} />
          <FormSelect label="Category" value={category} options={categories} onChange={setCategory} />
          <FormSelect label="Payment" value={paymentMethod} options={paymentMethods} onChange={setPaymentMethod} />
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex-1 text-sm text-right bg-transparent outline-none"
              style={{ color: 'var(--text-primary)', colorScheme: 'dark' }}
            />
          </div>
        </FormSection>

        <FormSection title="Notes">
          <FormInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional notes..." multiline />
        </FormSection>

        <div className="px-4 py-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-semibold text-sm ${
              isValid ? 'bg-purple-600 text-white active:bg-purple-700' : 'opacity-40 bg-purple-600 text-white'
            }`}
          >
            Add {type === 'income' ? 'Income' : 'Expense'}
          </button>
        </div>
        <div className="h-8" />
      </div>
    </Modal>
  )
}
